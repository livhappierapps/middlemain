import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { checkExecutiveKey } from "../lib/security";
import { createMemoryClient } from "../lib/memory";
import {
  getMemoryConfig,
  isAllowedMemoryUrl,
  memoryStatus,
  memoryTokenFrom,
  rebuildMemoryProfile,
  setMemoryConfig,
} from "../lib/memoryContext";

/** Owner-only Memory Machine wiring for the server Grok route. */
const memoryRouter = Router();

/** GET /api/memory/status — is injection configured, and is Memory Machine reachable. */
memoryRouter.get("/memory/status", async (req: Request, res: Response) => {
  if (!checkExecutiveKey(req, res)) return;
  const status = memoryStatus();
  const { url } = getMemoryConfig();
  let reachable: boolean | null = null;
  if (url) {
    reachable = await createMemoryClient({ baseUrl: url, timeoutMs: 3000 })
      .health()
      .then((h) => h?.ok === true)
      .catch(() => false);
  }
  res.json({ ...status, reachable });
});

/**
 * POST /api/memory/config {url?, serviceKey?}
 * Runtime override pushed from Settings (in memory until restart; env vars are durable).
 */
memoryRouter.post("/memory/config", (req: Request, res: Response) => {
  if (!checkExecutiveKey(req, res)) return;
  const { url, serviceKey } = (req.body ?? {}) as { url?: unknown; serviceKey?: unknown };
  if (url !== undefined && url !== null && (typeof url !== "string" || url.length > 500 || (url.trim() && !isAllowedMemoryUrl(url.trim())))) {
    res.status(400).json({ error: "Memory Machine URL must be an https:// address." });
    return;
  }
  if (serviceKey !== undefined && serviceKey !== null && (typeof serviceKey !== "string" || serviceKey.length > 500)) {
    res.status(400).json({ error: "Invalid service key." });
    return;
  }
  setMemoryConfig({
    ...(url !== undefined ? { url: (url as string | null) ?? null } : {}),
    ...(serviceKey !== undefined ? { serviceKey: (serviceKey as string | null) ?? null } : {}),
  });
  res.json(memoryStatus());
});

/**
 * POST /api/memory/profile/rebuild {force?}
 * Called nightly by .github/workflows/memory-profile-nightly.yml (free) or a Render cron.
 * Incremental: no new memories -> no LLM call. LLM cost is billed to this server's xAI key.
 */
memoryRouter.post("/memory/profile/rebuild", async (req: Request, res: Response) => {
  if (!checkExecutiveKey(req, res)) return;
  const force = (req.body as { force?: unknown } | undefined)?.force === true;
  try {
    const result = await rebuildMemoryProfile({ userToken: memoryTokenFrom(req), force });
    res.json(result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "error";
    logger.warn({ reason }, "Memory profile rebuild failed");
    const known = ["MEMORY_NOT_CONFIGURED", "MEMORY_SERVICE_KEY_MISSING", "XAI_KEY_MISSING"].includes(reason);
    res.status(known ? 503 : 502).json({ error: known ? reason : "MEMORY_PROFILE_REBUILD_FAILED" });
  }
});

export default memoryRouter;
