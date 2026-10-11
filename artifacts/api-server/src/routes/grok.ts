import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getXaiKey, hasXaiKey } from "../lib/xaiKey";
import { checkExecutiveKey } from "../lib/security";

const grokRouter = Router();
const XAI_BASE = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4.7";

function sendXaiError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}

interface MessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}
interface ChatMessage {
  role: string;
  content: string | MessageContent[];
}

/**
 * POST /api/grok/chat
 * Proxy streaming (or non-streaming) chat completions to xAI.
 * Supports multimodal (vision) messages — pass imageBase64 in body.
 * Default model is grok-4.7 (current coding / agent model). Callers may override.
 */
grokRouter.post("/grok/chat", async (req: Request, res: Response) => {
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

  const { model = DEFAULT_MODEL, messages, stream = true, systemPrompt } = req.body as {
    model?: string;
    messages: ChatMessage[];
    stream?: boolean;
    systemPrompt?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100 ||
      messages.some((message) => !message || !["system", "user", "assistant"].includes(message.role) ||
        (typeof message.content !== "string" && !Array.isArray(message.content))) ||
      typeof model !== "string" || model.length > 100 || typeof stream !== "boolean" ||
      (systemPrompt !== undefined && (typeof systemPrompt !== "string" || systemPrompt.length > 20_000))) {
    res.status(400).json({ error: "Invalid chat request" });
    return;
  }

  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt || "You are a helpful AI development assistant." },
    ...messages,
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const disconnect = () => { if (!res.writableFinished) controller.abort(); };
  res.on("close", disconnect);
  try {
    const upstream = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: fullMessages, stream, max_tokens: 2048 }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      logger.warn({ status: upstream.status }, "xAI upstream request failed");
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
      if (!reader) { res.status(500).json({ error: "No readable stream" }); return; }
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
    logger.error({ err }, "Grok proxy error");
    if (!res.headersSent && !res.destroyed) {
      sendXaiError(res, 502, "XAI_UPSTREAM_ERROR", "Could not reach Grok. Check your connection and try again.");
    } else if (!res.destroyed) {
      res.end();
    }
  } finally {
    clearTimeout(timeout);
    res.off("close", disconnect);
  }
});

/**
 * GET /api/grok/status
 * Returns whether the server-side Grok key is configured and lists available models.
 */
grokRouter.get("/grok/status", (_req: Request, res: Response) => {
  res.json({
    configured: hasXaiKey(),
    authorizationRequired: true,
    models: {
      text: DEFAULT_MODEL,
      coding: "grok-4.7",
      vision: "grok-2-vision-1212",
    },
    cli: {
      install: "bash scripts/install-grok-cli.sh",
      package: "@xai-official/grok",
    },
    features: {
      streaming: true,
      vision: true,
      skills: true,
    },
  });
});

export default grokRouter;
