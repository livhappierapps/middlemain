import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getXaiKey, hasXaiKey, setXaiKey } from "../lib/xaiKey";
import { checkExecutiveKey } from "../lib/security";

const executiveRouter = Router();
const XAI_BASE = "https://api.x.ai/v1";

function sendXaiError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}

// ─── Webhook inbox ────────────────────────────────────────────────────────────
// In-memory ring buffer of council digests received from Middlemain.
// Survives until the process restarts; Leo reads them via /executive/webhook/inbox.

interface WebhookDigest {
  sessionId?: string;
  trigger: "interval" | "auto-session-end" | "test";
  exchangeCount: number;
  messages: {
    role: string;
    participantName?: string;
    content: string;
    timestamp: string;
  }[];
  participants: { name: string; model: string; provider: string }[];
  sentAt: string;
}

interface InboxEntry {
  receivedAt: string;
  digest: WebhookDigest;
}

const webhookInbox: InboxEntry[] = [];
const MAX_INBOX = 30;
let memoryAuthFailureLogged = false;

class MemoryAuthUnavailableError extends Error {}

function logMemoryAuthFailureOnce(reason: "not_configured" | "rejected"): void {
  if (memoryAuthFailureLogged) return;
  memoryAuthFailureLogged = true;
  logger.warn(
    { reason },
    "Memory Machine credentials unavailable; memory calls will be skipped",
  );
}

function isMemoryAuthRejection(message: string): boolean {
  return /unauthori[sz]ed|invalid token|token.*(invalid|expired|reject)|authentication failed|forbidden/i.test(
    message,
  );
}

function respondMemoryUnavailable(
  res: Response,
  includeSaved = false,
): void {
  res.json({
    result: "",
    available: false,
    skipped: true,
    ...(includeSaved ? { saved: false } : {}),
  });
}

function getMcpUrl(): string {
  return (
    process.env["LEO_MEMORY_MACHINE_URL"] ||
    "https://the-memory-machine.replit.app/api/mcp"
  );
}

/** Calls an MCP tool on Leo's Memory Machine. */
async function mcpToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const token = process.env["LEO_MEMORY_TOKEN"];
  if (!token) throw new MemoryAuthUnavailableError("Memory Machine token not configured");

  const resp = await fetch(getMcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new MemoryAuthUnavailableError("Memory Machine token rejected");
    }
    throw new Error(`Memory Machine request failed (${resp.status})`);
  }

  const json = (await resp.json()) as {
    result?: { content?: { text?: string }[] };
    error?: { message?: string };
  };
  if (json.error) {
    const message =
      typeof json.error.message === "string" ? json.error.message : "Memory Machine request failed";
    if (isMemoryAuthRejection(message)) throw new MemoryAuthUnavailableError("Memory Machine token rejected");
    throw new Error("Memory Machine request failed");
  }

  const content = json.result?.content;
  if (Array.isArray(content)) {
    return content.map((c) => c.text ?? JSON.stringify(c)).join("\n");
  }
  return JSON.stringify(json.result);
}

/**
 * POST /api/executive/set-xai-key
 * Push a fresh xAI API key to the server at runtime — no restart needed.
 * Requires executive key. Key lives in memory until next server restart.
 */
executiveRouter.post("/executive/set-xai-key", (req: Request, res: Response) => {
  if (!checkExecutiveKey(req, res)) return;
  const { key } = req.body as { key?: string };
  if (!key || typeof key !== "string" || !key.trim()) {
    res.status(400).json({ error: "key is required" });
    return;
  }
  setXaiKey(key.trim());
  logger.info("XAI API key updated via executive endpoint");
  res.json({ ok: true, message: "XAI key updated — takes effect immediately" });
});

/**
 * GET /api/executive/status
 * Leo pings this to confirm his API is live and check capability flags.
 */
executiveRouter.get("/executive/status", (req: Request, res: Response) => {
  if (!checkExecutiveKey(req, res)) return;
  res.json({
    status: "online",
    memoryMachineUrl: getMcpUrl(),
    memoryConfigured: !!process.env["LEO_MEMORY_TOKEN"] && !memoryAuthFailureLogged,
    grokConfigured: hasXaiKey(),
    capabilities: ["chat", "memory/search", "memory/save", "memory/recent"],
  });
});

/**
 * POST /api/executive/chat
 * Leo sends messages and gets a Grok response through the server's XAI key.
 * Body: { messages: {role, content}[], model?, systemPrompt?, stream? }
 */
executiveRouter.post("/executive/chat", async (req: Request, res: Response) => {
  if (!checkExecutiveKey(req, res)) return;

  const apiKey = getXaiKey();
  if (!apiKey) {
    sendXaiError(
      res,
      503,
      "XAI_KEY_MISSING",
      "Server Grok is not configured. Add an xAI key in Settings → Middlemain Executive API.",
    );
    return;
  }

  const {
    model = "grok-3",
    messages,
    stream = false,
    systemPrompt,
  } = req.body as {
    model?: string;
    messages: { role: string; content: string }[];
    stream?: boolean;
    systemPrompt?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const fullMessages = [
    {
      role: "system",
      content:
        systemPrompt ||
        "You are Leo, the Executive AI overseeing Middlemain's AI agent council. You are decisive, direct, and authoritative. You coordinate work, give directives, and hold agents accountable.",
    },
    ...messages,
  ];

  try {
    const upstream = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: fullMessages, stream, max_tokens: 2048 }),
    });

    if (!upstream.ok) {
      logger.warn({ status: upstream.status }, "xAI executive request failed");
      if (upstream.status === 401 || upstream.status === 403) {
        sendXaiError(
          res,
          503,
          "XAI_KEY_REJECTED",
          "The xAI key configured for this server was rejected. Update it in Settings → Middlemain Executive API.",
        );
      } else if (upstream.status === 429) {
        sendXaiError(res, 429, "XAI_RATE_LIMITED", "Grok is busy right now. Try again shortly.");
      } else {
        sendXaiError(res, 502, "XAI_UPSTREAM_ERROR", "Grok is temporarily unavailable. Try again shortly.");
      }
      return;
    }

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const reader = upstream.body?.getReader();
      if (!reader) {
        res.status(500).json({ error: "No readable stream" });
        return;
      }
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        res.end();
      }
    } else {
      const json = await upstream.json();
      res.json(json);
    }
  } catch (err) {
    logger.error({ err }, "Executive chat error");
    if (res.headersSent) { res.end(); return; }
    sendXaiError(res, 502, "XAI_UPSTREAM_ERROR", "Could not reach Grok. Check your connection and try again.");
  }
});

/**
 * POST /api/executive/memory/search
 * Leo searches his Memory Machine for relevant memories.
 * Body: { query: string }
 */
executiveRouter.post(
  "/executive/memory/search",
  async (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;

    const { query } = req.body as { query?: string };
    if (!query?.trim()) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    try {
      const result = await mcpToolCall("search_memories", { query });
      res.json({ result });
    } catch (err: unknown) {
      if (err instanceof MemoryAuthUnavailableError) {
        logMemoryAuthFailureOnce(
          process.env["LEO_MEMORY_TOKEN"] ? "rejected" : "not_configured",
        );
        respondMemoryUnavailable(res);
        return;
      }
      logger.error({ err }, "Executive memory search error");
      res.status(502).json({ error: { code: "MEMORY_MACHINE_UNAVAILABLE", message: "Memory search is unavailable right now." } });
    }
  }
);

/**
 * POST /api/executive/memory/save
 * Leo saves a new memory to his Memory Machine.
 * Body: { title: string, content: string, tags?: string[] }
 */
executiveRouter.post(
  "/executive/memory/save",
  async (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;

    const { title, content, tags } = req.body as {
      title?: string;
      content?: string;
      tags?: string[];
    };
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: "title and content are required" });
      return;
    }

    try {
      const result = await mcpToolCall("save_memory", { title, content, tags });
      res.json({ result, saved: true });
    } catch (err: unknown) {
      if (err instanceof MemoryAuthUnavailableError) {
        logMemoryAuthFailureOnce(
          process.env["LEO_MEMORY_TOKEN"] ? "rejected" : "not_configured",
        );
        respondMemoryUnavailable(res, true);
        return;
      }
      logger.error({ err }, "Executive memory save error");
      res.status(502).json({ error: { code: "MEMORY_MACHINE_UNAVAILABLE", message: "Memory save is unavailable right now." } });
    }
  }
);

/**
 * POST /api/executive/memory/recent
 * Leo fetches his most recent conversations.
 * Body: { limit?: number }
 */
executiveRouter.post(
  "/executive/memory/recent",
  async (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;

    const { limit = 5 } = req.body as { limit?: number };

    try {
      const result = await mcpToolCall("list_recent_conversations", {
        limit: Math.min(limit, 20),
      });
      res.json({ result });
    } catch (err: unknown) {
      if (err instanceof MemoryAuthUnavailableError) {
        logMemoryAuthFailureOnce(
          process.env["LEO_MEMORY_TOKEN"] ? "rejected" : "not_configured",
        );
        respondMemoryUnavailable(res);
        return;
      }
      logger.error({ err }, "Executive memory recent error");
      res.status(502).json({ error: { code: "MEMORY_MACHINE_UNAVAILABLE", message: "Recent conversations are unavailable right now." } });
    }
  }
);

// ─── Webhook endpoints ────────────────────────────────────────────────────────

/**
 * POST /api/executive/webhook/council
 * Middlemain posts a council digest here when messages accumulate.
 * No executive key required — this is the inbound receiver.
 */
executiveRouter.post(
  "/executive/webhook/council",
  (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;
    const digest = req.body as WebhookDigest;
    if (!digest || typeof digest !== "object") {
      res.status(400).json({ error: "Invalid digest payload" });
      return;
    }

    const entry: InboxEntry = {
      receivedAt: new Date().toISOString(),
      digest: { ...digest, trigger: digest.trigger ?? "interval" },
    };
    webhookInbox.unshift(entry);
    if (webhookInbox.length > MAX_INBOX) webhookInbox.length = MAX_INBOX;

    logger.info(
      {
        trigger: digest.trigger,
        exchangeCount: digest.exchangeCount,
        messageCount: digest.messages?.length,
      },
      "Council digest received via webhook"
    );

    res.json({ received: true, inboxSize: webhookInbox.length });
  }
);

/**
 * POST /api/executive/webhook/test
 * Middlemain sends a minimal test payload to verify the webhook URL is reachable.
 * Also stores in inbox so Leo can confirm it arrived.
 */
executiveRouter.post(
  "/executive/webhook/test",
  (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;
    const body = (req.body ?? {}) as Partial<WebhookDigest>;

    const entry: InboxEntry = {
      receivedAt: new Date().toISOString(),
      digest: {
        trigger: "test",
        exchangeCount: 0,
        messages: [],
        participants: [],
        sentAt: body.sentAt ?? new Date().toISOString(),
        ...body,
      },
    };
    webhookInbox.unshift(entry);
    if (webhookInbox.length > MAX_INBOX) webhookInbox.length = MAX_INBOX;

    logger.info("Council webhook test ping received");

    res.json({ received: true, test: true, message: "Webhook is reachable" });
  }
);

/**
 * GET /api/executive/webhook/inbox
 * Leo reads council digests that were posted to this server.
 * Requires executive key.
 */
executiveRouter.get(
  "/executive/webhook/inbox",
  (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;

    const limitParam = req.query["limit"];
    const limit = limitParam
      ? Math.min(Number(limitParam), MAX_INBOX)
      : MAX_INBOX;

    res.json({
      inbox: webhookInbox.slice(0, limit),
      count: webhookInbox.length,
    });
  }
);

/**
 * DELETE /api/executive/webhook/inbox
 * Leo clears all received digests.
 * Requires executive key.
 */
executiveRouter.delete(
  "/executive/webhook/inbox",
  (req: Request, res: Response) => {
    if (!checkExecutiveKey(req, res)) return;
    const cleared = webhookInbox.length;
    webhookInbox.length = 0;
    res.json({ cleared });
  }
);

export default executiveRouter;
