import type { MemoryClient } from "./client";
import { DEFAULT_HIGH_STAKES_TERMS } from "./rank";
import { PROFILE_SOURCE_PATH, type Memory, type Profile } from "./types";

/**
 * Section guide for the standing profile. Generic headings only: every fact
 * in the profile must come from the user's own memories at build time.
 */
export const DEFAULT_PROFILE_SECTIONS = [
  "Who they are (name, how they like to be addressed, role)",
  "Family and household (people, ages, relationships, pronouns where stated)",
  "Home and living situation",
  "Health (conditions, limits, care that affects daily life)",
  "Legal and case matters (agencies, courts, upcoming dates, key people)",
  "Work, apps and projects",
  "Brand and style preferences",
  "How to help them well (tone, constraints, budget sensitivities)",
  "Open threads and upcoming dates",
];

export interface SummarizeRequest {
  system: string;
  user: string;
}

export interface RebuildOptions {
  client: MemoryClient;
  /** LLM call that returns the new profile text. The caller's key pays for it. */
  summarize: (req: SummarizeRequest) => Promise<string>;
  /** Skip the LLM entirely when nothing changed since the last build. Default true. */
  incremental?: boolean;
  /** Max memories read per rebuild (cost guard). Default 400. */
  maxMemories?: number;
  pageSize?: number;
  /** Max chars sent per LLM call. Default 48k (~12k tokens). */
  chunkChars?: number;
  /** Max LLM calls per rebuild (cost guard). Default 4. */
  maxLlmCalls?: number;
  maxProfileChars?: number;
  sections?: string[];
  highStakesTerms?: string[];
  /** Label stored in metadata, e.g. the model name. */
  model?: string;
  now?: Date;
  /** Per-request timeout for Memory Machine reads. Default 15s. */
  requestTimeoutMs?: number;
}

export interface RebuildResult {
  status: "rebuilt" | "unchanged" | "empty";
  newMemories: number;
  llmCalls: number;
  inputChars: number;
  profileChars: number;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function line(m: Memory): string {
  const when = (m.occurredAt ?? m.createdAt ?? "").slice(0, 10);
  return `- (${when}) [${m.kind}] ${squash(m.title || "Untitled").slice(0, 160)}: ${squash(m.body ?? "").slice(0, 400)}`;
}

/** Read memories newest-first with `before=` paging, stopping at `since`. */
export async function collectMemories(
  client: MemoryClient,
  opts: { since?: string; max: number; pageSize: number; timeoutMs: number },
): Promise<Memory[]> {
  const out: Memory[] = [];
  let before: string | undefined;
  const sinceMs = opts.since ? Date.parse(opts.since) : NaN;
  for (;;) {
    const { items } = await client.listMemories({ limit: opts.pageSize, before }, opts.timeoutMs);
    if (!items?.length) break;
    for (const m of items) {
      if (Number.isFinite(sinceMs) && Date.parse(m.createdAt) <= sinceMs) return out;
      if (m.sourcePath !== PROFILE_SOURCE_PATH) out.push(m);
      if (out.length >= opts.max) return out;
    }
    if (items.length < opts.pageSize) break;
    before = items[items.length - 1]!.createdAt;
  }
  return out;
}

export function profileSystemPrompt(sections: string[], maxChars: number): string {
  return [
    "You maintain a private standing profile of ONE user, built only from their own saved memories.",
    "Update the existing profile with the new memories. Keep facts that are still true, fix ones the new memories contradict,",
    "and drop trivia. Prefer stable, load-bearing facts (people, health, legal/case dates, housing, work) over one-off chatter.",
    "Never invent facts. If something is uncertain, say so briefly. Use these sections (omit empty ones):",
    ...sections.map((s) => `## ${s}`),
    `Write terse bullet points. Stay under ${maxChars} characters. Output only the profile.`,
  ].join("\n");
}

/**
 * Rebuild the standing profile from memories and store it with PUT /v1/profile.
 * Incremental: only memories newer than the last build are read and folded in,
 * so a quiet day costs zero LLM calls.
 */
export async function rebuildProfile(o: RebuildOptions): Promise<RebuildResult> {
  const maxProfileChars = o.maxProfileChars ?? 6000;
  const chunkChars = o.chunkChars ?? 48_000;
  const maxCalls = o.maxLlmCalls ?? 4;
  const timeoutMs = o.requestTimeoutMs ?? 15_000;
  const prev: Profile | null = await o.client.getProfile(timeoutMs);
  const since = o.incremental === false ? undefined : (prev?.metadata?.newestCreatedAt as string | undefined);

  const fresh = await collectMemories(o.client, { since, max: o.maxMemories ?? 400, pageSize: o.pageSize ?? 200, timeoutMs });
  let pool = fresh;
  if (!since) {
    // First build: also pull older load-bearing memories that newest-first paging would miss.
    const terms = (o.highStakesTerms ?? DEFAULT_HIGH_STAKES_TERMS).filter((t) => !t.includes(" ")).slice(0, 8);
    const { items } = await o.client
      .listMemories({ search: terms.join(" "), match: "any", limit: 100 }, timeoutMs)
      .catch(() => ({ items: [] as Memory[] }));
    const ids = new Set(pool.map((m) => m.id));
    pool = [...pool, ...items.filter((m) => !ids.has(m.id) && m.sourcePath !== PROFILE_SOURCE_PATH)];
  }
  if (!pool.length) {
    return { status: prev ? "unchanged" : "empty", newMemories: 0, llmCalls: 0, inputChars: 0, profileChars: prev?.body?.length ?? 0 };
  }

  // Oldest first so later memories win when they contradict earlier ones.
  const ordered = [...pool].sort((a, b) => Date.parse(a.occurredAt ?? a.createdAt) - Date.parse(b.occurredAt ?? b.createdAt));
  const chunks: string[] = [];
  let cur = "";
  for (const m of ordered) {
    const l = line(m);
    if (cur.length + l.length + 1 > chunkChars && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += `${l}\n`;
  }
  if (cur) chunks.push(cur);
  // Cost guard: keep the newest chunks if there are too many.
  const used = chunks.slice(-maxCalls);

  const system = profileSystemPrompt(o.sections ?? DEFAULT_PROFILE_SECTIONS, maxProfileChars);
  let profile = prev?.body?.trim() ?? "";
  let inputChars = 0;
  for (const chunk of used) {
    const user = `EXISTING PROFILE:\n${profile || "(none yet)"}\n\nNEW MEMORIES:\n${chunk}`;
    inputChars += system.length + user.length;
    const next = (await o.summarize({ system, user })).trim();
    if (next) profile = next.slice(0, maxProfileChars);
  }
  if (!profile) return { status: "empty", newMemories: pool.length, llmCalls: used.length, inputChars, profileChars: 0 };

  const newest = pool.reduce((acc, m) => (Date.parse(m.createdAt) > Date.parse(acc) ? m.createdAt : acc), since ?? pool[0]!.createdAt);
  await o.client.putProfile(
    profile,
    {
      version: 1,
      builtAt: (o.now ?? new Date()).toISOString(),
      newestCreatedAt: newest,
      memoryCount: Number(prev?.metadata?.memoryCount ?? 0) + pool.length,
      model: o.model ?? null,
    },
    timeoutMs,
  );
  return { status: "rebuilt", newMemories: pool.length, llmCalls: used.length, inputChars, profileChars: profile.length };
}

/** True when the profile is missing or older than maxAgeHours. */
export function isProfileStale(profile: Profile | null, maxAgeHours: number, now = new Date()): boolean {
  const built = Date.parse(String(profile?.metadata?.builtAt ?? profile?.updatedAt ?? ""));
  return !Number.isFinite(built) || now.getTime() - built > maxAgeHours * 3_600_000;
}
