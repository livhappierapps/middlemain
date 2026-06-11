import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const grokRouter = Router();

const XAI_BASE = "https://api.x.ai/v1";

/**
 * POST /api/grok/chat
 * Proxy streaming chat completions to xAI using the server-stored key.
 * Body: { model?, messages: [{role, content}][], stream?, systemPrompt? }
 */
grokRouter.post("/grok/chat", async (req: Request, res: Response) => {
  const apiKey = process.env["XAI_API_KEY"];

  if (!apiKey) {
    res.status(503).json({ error: "XAI_API_KEY not configured on server" });
    return;
  }

  const { model = "grok-3", messages, stream = true, systemPrompt } = req.body as {
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
    ...(systemPrompt
      ? [{ role: "system", content: systemPrompt }]
      : [{ role: "system", content: "You are a helpful AI development assistant." }]),
    ...messages,
  ];

  try {
    const upstream = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
      if (!reader) {
        res.status(500).json({ error: "No readable stream from upstream" });
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
    logger.error({ err }, "Grok proxy error");
    res.status(500).json({ error: "Proxy request failed" });
  }
});

/**
 * GET /api/grok/status
 * Returns whether the server-side Grok key is configured.
 */
grokRouter.get("/grok/status", (_req: Request, res: Response) => {
  res.json({ configured: !!process.env["XAI_API_KEY"] });
});

export default grokRouter;
