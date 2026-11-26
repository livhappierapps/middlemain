/**
 * Middlemain's wiring of the shared Memory Machine layer (conn-manager/memory).
 *
 * Config precedence: runtime override pushed by the owner from Settings ->
 * env vars MEMORY_MACHINE_URL / MEMORY_MACHINE_SERVICE_KEY. Runtime values live
 * in process memory only (free Render instances restart), so the env vars are
 * the durable source; the app re-pushes its saved values on launch.
 *
 * Auth to Memory Machine: the user's Clerk session JWT (sent by the app in
 * `X-Memory-Token`, forwarded as Bearer) is preferred; the service key is the
 * fallback and the only option for scheduled jobs.
 */
import type { Request } from "express";
import { logger } from "./logger";
import { getXaiKey } from "./xaiKey";
import {
  clearProfileCache,
  createMemoryClient,
  injectMemoryContext,
  isProfileStale,
  rebuildProfile,
  type InjectResult,
  type RebuildResult,
} from "./memory";

const XAI_BASE = "https://api.x.ai/v1";
/** Cheapest current xAI text model ($1.25 in / $2.50 out per 1M tokens). Override with MEMORY_PROFILE_MODEL. */
const DEFAULT_PROFILE_MODEL = "grok-4.3";

let runtimeUrl: string | null = null;
let runtimeServiceKey: string | null = null;

export function isAllowedMemoryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname) && process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export function setMemoryConfig(cfg: { url?: string | null; serviceKey?: string | null }): void {
  if (cfg.url !== undefined) runtimeUrl = cfg.url?.trim().replace(/\/+$/, "") || null;
  if (cfg.serviceKey !== undefined) runtimeServiceKey = cfg.serviceKey?.trim() || null;
  clearProfileCache();
}

export function getMemoryConfig(): { url: string | null; serviceKey: string | null } {
  const url = (runtimeUrl ?? process.env["MEMORY_MACHINE_URL"]?.trim().replace(/\/+$/, "")) || null;
  const serviceKey = (runtimeServiceKey ?? process.env["MEMORY_MACHINE_SERVICE_KEY"]?.trim()) || null;
  return { url: url && isAllowedMemoryUrl(url) ? url : null, serviceKey };
}

export function memoryStatus() {
  const { url, serviceKey } = getMemoryConfig();
  return { configured: !!url, hasServiceKey: !!serviceKey, injection: process.env["MEMORY_INJECTION"] !== "off" };
}

/** Clerk session JWT the app attached for Memory Machine, if any. Never logged. */
export function memoryTokenFrom(req: Request): string | null {
  const raw = req.header("x-memory-token")?.trim().replace(/^Bearer\s+/i, "");
  return raw && raw.length < 8192 && /^[A-Za-z0-9._-]+$/.test(raw) ? raw : null;
}

const numEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Pre-call hook for the xAI route. Always resolves (never throws), within
 * ~1.5 s; returns the original prompt when Memory Machine is unset/down/slow.
 */
export async function withMemoryContext(systemPrompt: string, userMessage: string, userToken: string | null): Promise<InjectResult> {
  const { url, serviceKey } = getMemoryConfig();
  if (!url || process.env["MEMORY_INJECTION"] === "off" || (!userToken && !serviceKey)) {
    return { systemPrompt, memories: [], profileIncluded: false, skipped: "not_configured" };
  }
  const result = await injectMemoryContext(systemPrompt, userMessage, {
    baseUrl: url,
    getToken: userToken ? () => userToken : undefined,
    serviceKey: serviceKey ?? undefined,
    timeoutMs: numEnv("MEMORY_TIMEOUT_MS", 1500),
    halfLifeDays: numEnv("MEMORY_HALF_LIFE_DAYS", 45),
    extraHighStakesTerms: (process.env["MEMORY_HIGH_STAKES_TERMS"] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    profileMaxChars: numEnv("MEMORY_PROFILE_MAX_CHARS", 4000),
    onError: (stage, err) => {
      const status = typeof err === "object" && err && "status" in err ? (err as { status: number }).status : undefined;
      logger.warn({ stage, status, reason: err instanceof Error ? err.message : "error" }, "Memory context skipped");
    },
  });
  maybeLazyRebuild(url, serviceKey);
  return result;
}

async function xaiSummarize(req: { system: string; user: string }): Promise<string> {
  const apiKey = getXaiKey();
  if (!apiKey) throw new Error("XAI_KEY_MISSING");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env["MEMORY_PROFILE_MODEL"] || DEFAULT_PROFILE_MODEL,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        stream: false,
        max_tokens: 2000,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`xai_${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

let rebuilding: Promise<RebuildResult> | null = null;

/**
 * Rebuild the standing profile (incremental; zero LLM calls if no new memories).
 * Uses the service key (scheduled jobs have no user session) unless a user token is given.
 * Cost: billed to this server's xAI key.
 */
export function rebuildMemoryProfile(opts: { userToken?: string | null; force?: boolean } = {}): Promise<RebuildResult> {
  if (rebuilding) return rebuilding;
  const { url, serviceKey } = getMemoryConfig();
  if (!url) return Promise.reject(new Error("MEMORY_NOT_CONFIGURED"));
  if (!opts.userToken && !serviceKey) return Promise.reject(new Error("MEMORY_SERVICE_KEY_MISSING"));
  const client = createMemoryClient({
    baseUrl: url,
    getToken: opts.userToken ? () => opts.userToken ?? null : undefined,
    serviceKey: serviceKey ?? undefined,
    timeoutMs: 15_000,
  });
  rebuilding = rebuildProfile({
    client,
    summarize: xaiSummarize,
    incremental: !opts.force,
    maxMemories: numEnv("MEMORY_PROFILE_MAX_MEMORIES", 400),
    maxLlmCalls: numEnv("MEMORY_PROFILE_MAX_LLM_CALLS", 4),
    maxProfileChars: numEnv("MEMORY_PROFILE_MAX_CHARS", 4000),
    model: process.env["MEMORY_PROFILE_MODEL"] || DEFAULT_PROFILE_MODEL,
  })
    .then((r) => {
      clearProfileCache();
      logger.info({ status: r.status, newMemories: r.newMemories, llmCalls: r.llmCalls, inputChars: r.inputChars }, "Memory profile rebuild");
      return r;
    })
    .finally(() => {
      rebuilding = null;
    });
  return rebuilding;
}

let lastLazyCheck = 0;
/**
 * Optional fallback schedule (off by default): when MEMORY_PROFILE_LAZY_HOURS
 * is set, a chat may kick off a background rebuild if the profile is older
 * than that. Checked at most once an hour; never delays the chat.
 */
function maybeLazyRebuild(url: string, serviceKey: string | null): void {
  const hours = Number(process.env["MEMORY_PROFILE_LAZY_HOURS"]);
  if (!serviceKey || !Number.isFinite(hours) || hours <= 0 || Date.now() - lastLazyCheck < 3_600_000) return;
  lastLazyCheck = Date.now();
  void createMemoryClient({ baseUrl: url, serviceKey, timeoutMs: 5000 })
    .getProfile()
    .then((p) => (isProfileStale(p, hours) ? rebuildMemoryProfile() : null))
    .catch((err) => logger.warn({ reason: err instanceof Error ? err.message : "error" }, "Lazy profile rebuild skipped"));
}

/** Text of the latest user turn (string or multimodal text parts). */
export function lastUserText(messages: { role: string; content: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content.slice(0, 4000);
    if (Array.isArray(m.content)) {
      return m.content
        .map((p) => (p && typeof p === "object" && (p as { type?: string }).type === "text" ? String((p as { text?: unknown }).text ?? "") : ""))
        .join(" ")
        .slice(0, 4000);
    }
    return "";
  }
  return "";
}
