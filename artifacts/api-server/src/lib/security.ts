import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, RequestHandler } from "express";

/** Owner-only authorization; never embed this key in a public client build. */
export function checkExecutiveKey(req: Request, res: Response): boolean {
  const key = process.env.LEO_EXECUTIVE_KEY;
  if (!key) {
    res.status(503).json({ error: "Owner authorization is not configured" });
    return false;
  }
  const provided = req.header("x-executive-key");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!provided || !timingSafeEqual(digest(provided), digest(key))) {
    res.status(401).json({ error: "Owner authorization required. Use your own provider connection, or configure the executive key on your trusted device." });
    return false;
  }
  return true;
}

/** Bounded in-process abuse protection; does not trust spoofable forwarded IPs. */
export function createRateLimiter(limit: number, windowMs = 60_000): RequestHandler {
  const windows = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const id = req.socket.remoteAddress ?? "unknown";
    for (const [key, entry] of windows) {
      if (entry.until <= now) windows.delete(key);
    }
    let entry = windows.get(id);
    if (!entry) {
      if (windows.size >= 1_000) {
        res.status(429).json({ error: "Service is busy. Try again shortly." });
        return;
      }
      entry = { count: 0, until: now + windowMs };
      windows.set(id, entry);
    }
    if (entry.count >= limit) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((entry.until - now) / 1_000)));
      res.status(429).json({ error: "Too many requests. Try again shortly." });
      return;
    }
    entry.count += 1;
    next();
  };
}
