import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getXaiKey, hasXaiKey } from "../lib/xaiKey";

const grokRouter = Router();
const XAI_BASE = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4.7";

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
  const apiKey = getXaiKey();
  if (!apiKey) { res.status(503).json({ error: "XAI_API_KEY not configured on server" }); return; }

  const { model = DEFAULT_MODEL, messages, stream = true, systemPrompt } = req.body as {
    model?: string;
    messages: ChatMessage[];
    stream?: boolean;
    systemPrompt?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const fullMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt || "You are a helpful AI development assistant." },
    ...messages,
  ];

  try {
    const upstream = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: fullMessages, stream }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      logger.warn({ status: upstream.status, body: text.slice(0, 300) }, "xAI upstream error");
      res.status(upstream.status).json({ error: text });
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
    res.status(500).json({ error: "Proxy request failed" });
  }
});

/**
 * GET /api/grok/status
 * Returns whether the server-side Grok key is configured and lists available models.
 */
grokRouter.get("/grok/status", (_req: Request, res: Response) => {
  res.json({
    configured: hasXaiKey(),
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
