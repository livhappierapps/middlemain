import { buildMemoryBlock, buildProfileBlock, type BlockOptions } from "./block";
import { createMemoryClient, type MemoryClient, type MemoryClientOptions } from "./client";
import { extractKeywords, rankMemories, type RankedMemory, type RankOptions } from "./rank";
import type { Profile } from "./types";

export interface InjectOptions extends RankOptions {
  /** Use an existing client, or pass baseUrl/getToken/serviceKey to build one. */
  client?: MemoryClient;
  baseUrl?: string;
  getToken?: MemoryClientOptions["getToken"];
  serviceKey?: string;
  fetch?: typeof fetch;
  /** Total time budget for the whole injection. Default 1500 ms. */
  timeoutMs?: number;
  /** Candidates fetched before re-ranking down to topK. Default 25. */
  candidateLimit?: number;
  /** Include the standing profile as the baseline layer. Default true. */
  includeProfile?: boolean;
  /** Cache the profile in-process this long. Default 10 min. 0 disables. */
  profileCacheMs?: number;
  profileMaxChars?: number;
  block?: BlockOptions;
  /** Called with a stage name and error; never with memory content. */
  onError?: (stage: "search" | "profile" | "budget", err: unknown) => void;
}

export interface InjectResult {
  systemPrompt: string;
  memories: RankedMemory[];
  profileIncluded: boolean;
  /** Why nothing was injected, if so. */
  skipped?: "not_configured" | "empty" | "error";
}

const profileCache = new Map<string, { at: number; profile: Profile | null }>();

/** Exposed for tests and for apps that want to drop the cache after a rebuild. */
export function clearProfileCache(): void {
  profileCache.clear();
}

function jwtSubject(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="))
        : (globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } }).Buffer?.from(b64, "base64").toString("utf8");
    const sub = json ? (JSON.parse(json) as { sub?: unknown }).sub : null;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Pre-call hook: returns the system prompt with a baseline profile layer and
 * a "Relevant memories" block appended. NEVER throws and never takes longer
 * than `timeoutMs`; on any failure it returns the original prompt unchanged.
 */
export async function injectMemoryContext(systemPrompt: string, userMessage: string, opts: InjectOptions = {}): Promise<InjectResult> {
  const base = systemPrompt ?? "";
  const unchanged = (skipped: InjectResult["skipped"]): InjectResult => ({ systemPrompt: base, memories: [], profileIncluded: false, skipped });
  try {
    const budget = opts.timeoutMs ?? 1500;
    let token: string | null = null;
    const getToken = opts.getToken
      ? async () => {
          token = (await opts.getToken!()) ?? null;
          return token;
        }
      : undefined;
    const client =
      opts.client ??
      (opts.baseUrl && (opts.getToken || opts.serviceKey)
        ? createMemoryClient({ baseUrl: opts.baseUrl, getToken, serviceKey: opts.serviceKey, fetch: opts.fetch, timeoutMs: budget })
        : null);
    if (!client) return unchanged("not_configured");

    const keywords = extractKeywords(userMessage ?? "");
    const searchP = keywords.length
      ? client
          .listMemories({ search: keywords.join(" "), match: "any", limit: opts.candidateLimit ?? 25 }, budget)
          .then((r) => r.items ?? [])
          .catch((err) => {
            opts.onError?.("search", err);
            return [];
          })
      : Promise.resolve([]);

    const cacheMs = opts.profileCacheMs ?? 10 * 60_000;
    const profileP =
      opts.includeProfile === false
        ? Promise.resolve(null)
        : (async () => {
            // Resolve the token first so the cache is per user, not per server.
            if (getToken && !opts.client) await getToken().catch(() => null);
            const who = token ? jwtSubject(token) : opts.serviceKey ? "service" : null;
            const key = who ? `${opts.baseUrl ?? "client"}|${who}` : null;
            const hit = key ? profileCache.get(key) : undefined;
            if (hit && Date.now() - hit.at < cacheMs) return hit.profile;
            const profile = await client.getProfile(budget);
            if (key && cacheMs > 0) profileCache.set(key, { at: Date.now(), profile });
            return profile;
          })().catch((err) => {
            opts.onError?.("profile", err);
            return null;
          });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"timeout">((r) => {
      timer = setTimeout(() => r("timeout"), budget + 50);
    });
    const settled = await Promise.race([Promise.all([searchP, profileP]), deadline]);
    clearTimeout(timer);
    if (settled === "timeout") {
      opts.onError?.("budget", new Error("memory_timeout"));
      return unchanged("error");
    }
    const [candidates, profile] = settled;
    const memories = rankMemories(candidates, userMessage ?? "", opts);
    const profileBlock = buildProfileBlock(profile, opts.profileMaxChars);
    const memoryBlock = buildMemoryBlock(memories, opts.block);
    if (!profileBlock && !memoryBlock) return unchanged("empty");
    return {
      systemPrompt: [base, profileBlock, memoryBlock].filter((s) => s && s.trim()).join("\n\n"),
      memories,
      profileIncluded: !!profileBlock,
    };
  } catch (err) {
    opts.onError?.("search", err);
    return unchanged("error");
  }
}
