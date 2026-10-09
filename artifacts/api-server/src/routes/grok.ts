import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { getXaiKey, hasXaiKey } from "../lib/xaiKey";

const grokRouter = Router();
const XAI_BASE = "https://api.x.ai/v1";

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
 */
grokRouter.post("/grok/chat", async (req: Request, res: Response) => {
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

  const { model = "grok-3", messages, stream = true, systemPrompt } = req.body as {
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
    sendXaiError(res, 502, "XAI_UPSTREAM_ERROR", "Could not reach Grok. Check your connection and try again.");
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
      text: "grok-3",
      vision: "grok-2-vision-1212",
    },
    features: {
      streaming: true,
      vision: true,
      skills: true,
    },
  });
});

export default grokRouter;
