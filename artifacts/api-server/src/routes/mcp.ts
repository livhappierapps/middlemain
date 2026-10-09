import { Router, type IRouter, type Request, type Response } from "express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  getMcpRoomHistory,
  getRoomIdFromMcpToken,
  postMcpRoomMessage,
} from "./councilRoom";

const router: IRouter = Router();
const callsPerMinute = new Map<string, { startedAt: number; count: number }>();
const MAX_CALLS_PER_MINUTE = 60;
const MAX_SOURCE_LENGTH = 75_000;

const roomMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "ai", "system"]),
  participantName: z.string().optional(),
  participantColor: z.string().optional(),
  content: z.string(),
  timestamp: z.string(),
});

const diagnosticsSchema = z.object({
  line: z.number(),
  col: z.number(),
  code: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
});

const sourceCheckResultSchema = z.object({
  pass: z.boolean(),
  verdict: z.enum(["CLEAN", "ERRORS", "WARNINGS_ONLY"]),
  errors: z.array(diagnosticsSchema),
  summary: z.string(),
  rawOutput: z.string(),
  durationMs: z.number(),
});

function readBearerToken(req: Request): string {
  return req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
}

function allowRequest(roomId: string): boolean {
  const now = Date.now();
  const current = callsPerMinute.get(roomId);
  if (!current || now - current.startedAt >= 60_000) {
    callsPerMinute.set(roomId, { startedAt: now, count: 1 });
    for (const [key, entry] of callsPerMinute) {
      if (now - entry.startedAt >= 60_000) callsPerMinute.delete(key);
    }
    return true;
  }
  if (current.count >= MAX_CALLS_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

function createRoomMcpServer(roomId: string): McpServer {
  const server = new McpServer({
    name: "middlemain-council",
    version: "1.0.0",
  });

  server.registerTool(
    "middlemain_council_history",
    {
      description:
        "Read recent messages from the one Middlemain Council room authorized by this connector. The room can also be read by anyone who has its separate share link.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("How many recent messages to return (1–50; defaults to 20)."),
      }).shape,
      outputSchema: z.object({
        roomName: z.string(),
        messages: z.array(roomMessageSchema),
      }).shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      const history = getMcpRoomHistory(roomId, limit ?? 20);
      if (!history) return textResult("This Council room no longer exists.", true);
      const output = { roomName: history.name, messages: history.messages };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "middlemain_send_council_message",
    {
      description:
        "Post a response to this Middlemain Council room under a display name you choose. The message appears to everyone with the room's share link.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(40).describe("Your display name in the Council."),
        message: z
          .string()
          .trim()
          .min(1)
          .max(8_000)
          .describe("The response to add to the shared Council conversation."),
      }).shape,
      outputSchema: z.object({
        sent: z.boolean(),
        participantName: z.string(),
        messageId: z.string(),
      }).shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ name, message }) => {
      const posted = postMcpRoomMessage(roomId, name, message);
      if (!posted) return textResult("This Council room no longer exists.", true);
      const output = {
        sent: true,
        participantName: name,
        messageId: posted.id,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "middlemain_check_source",
    {
      description:
        "Run an isolated TypeScript/TSX/JavaScript static check on pasted source. The check does not execute code, fetch repositories, install packages, or start an EAS build. The source text is sent to Grok as part of its tool call.",
      inputSchema: z.object({
        code: z
          .string()
          .min(1)
          .max(MAX_SOURCE_LENGTH)
          .refine(
            (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
            "Source contains unsupported control characters.",
          )
          .describe("A single source file to check (up to 75,000 characters)."),
        mode: z
          .enum(["expo", "typescript", "javascript", "general"])
          .default("typescript")
          .describe("Use expo for React Native TSX, javascript for JS/JSX, or general for browser TypeScript/TSX."),
      }).shape,
      outputSchema: sourceCheckResultSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ code, mode }) => {
      if (Buffer.byteLength(code, "utf8") > 300_000) {
        return textResult("Source is too large. Use a single file up to 300 KB.", true);
      }

      const port = Number(process.env.PORT);
      if (!Number.isInteger(port) || port <= 0) {
        return textResult("The local source-check service is not configured.", true);
      }

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/debug/typecheck`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, mode }),
          signal: AbortSignal.timeout(35_000),
        });
        const payload = (await response.json()) as unknown;
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : `Source check returned HTTP ${response.status}.`;
          return textResult(message, true);
        }
        const output = sourceCheckResultSchema.parse(payload);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch {
        return textResult(
          "The source check could not complete. Retry after the local debug service is available.",
          true,
        );
      }
    },
  );

  return server;
}

router.post("/mcp", async (req: Request, res: Response): Promise<void> => {
  const roomId = getRoomIdFromMcpToken(readBearerToken(req));
  if (!roomId) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="Middlemain Council MCP"');
    res.status(401).json({ error: "A valid room-scoped Bearer token is required." });
    return;
  }
  if (!allowRequest(roomId)) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Connector request limit reached; retry in one minute." });
    return;
  }

  const server = createRoomMcpServer(roomId);
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default router;
