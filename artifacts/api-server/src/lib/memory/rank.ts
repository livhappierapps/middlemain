import { PROFILE_SOURCE_PATH, type Memory } from "./types";

const STOPWORDS = new Set(
  ("a an and are as at be been but by can could did do does for from had has have he her him his how i if in into is it its " +
    "just me my no not of on or our she so than that the their them then there these they this to too up us was we were " +
    "what when where which who why will with would you your yours im ive dont cant about any all also get got let lets " +
    "please tell know like want need make some more much very okay ok hey hi")
    .split(" "),
);

/**
 * Words that mark load-bearing memories (case, custody, health, housing).
 * Matched as word prefixes, so "hearing" also hits "hearings". Generic on
 * purpose: nothing personal is hardcoded; apps can extend via options.
 */
export const DEFAULT_HIGH_STAKES_TERMS = [
  "dhs", "court", "custody", "icwa", "hearing", "judge", "attorney", "lawyer", "caseworker", "case plan",
  "visitation", "tribal", "tribe", "subpoena", "deadline", "medical", "doctor", "hospital", "surgery",
  "diagnos", "medication", "prescription", "appointment", "camper", "eviction", "lease", "landlord",
];

export interface RankOptions {
  /** Max results. Default 5. */
  topK?: number;
  /** Freshness half-life in days. Default 45. */
  halfLifeDays?: number;
  /** Weight of keyword relevance (0..1 score). Default 0.6. */
  relevanceWeight?: number;
  /** Weight of freshness (0..1 score). Default 0.25. */
  freshnessWeight?: number;
  /** Flat boost for high-stakes memories. Default 0.25. */
  highStakesBoost?: number;
  /** High-stakes memories never decay below this freshness. Default 0.8. */
  highStakesFreshnessFloor?: number;
  /** Replace (not extend) the default high-stakes terms. */
  highStakesTerms?: string[];
  /** Extra high-stakes terms appended to the defaults. */
  extraHighStakesTerms?: string[];
  /** Memory kinds always treated as high-stakes. Default none. */
  highStakesKinds?: string[];
  /** Drop items scoring below this. Default 0.05. */
  minScore?: number;
  now?: Date;
}

export interface RankedMemory extends Memory {
  score: number;
  relevance: number;
  freshness: number;
  highStakes: boolean;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

/** Distinct, non-stopword keywords from a chat message, longest first (max 8). */
export function extractKeywords(text: string, max = 8): string[] {
  const seen = new Set<string>();
  for (const t of tokenize(text)) if (!STOPWORDS.has(t) && t.length >= 3) seen.add(t);
  return [...seen].sort((a, b) => b.length - a.length).slice(0, max);
}

function matchesTerm(tokens: string[], joined: string, term: string): boolean {
  const t = term.toLowerCase();
  return t.includes(" ") ? joined.includes(t) : tokens.some((tok) => tok.startsWith(t));
}

/**
 * Relevance over raw newest-first:
 *   score = relevanceWeight * keywordOverlap + freshnessWeight * freshness + stakesBoost
 * keywordOverlap: title hits count double, body hits single, normalised to 0..1,
 * +0.2 when the whole message appears verbatim. freshness = 0.5^(ageDays/halfLife),
 * floored for high-stakes memories so old court dates / case notes don't fade out.
 */
export function rankMemories(items: Memory[], query: string, opts: RankOptions = {}): RankedMemory[] {
  const now = (opts.now ?? new Date()).getTime();
  const halfLife = Math.max(opts.halfLifeDays ?? 45, 0.1);
  const wRel = opts.relevanceWeight ?? 0.6;
  const wFresh = opts.freshnessWeight ?? 0.25;
  const boost = opts.highStakesBoost ?? 0.25;
  const floor = opts.highStakesFreshnessFloor ?? 0.8;
  const minScore = opts.minScore ?? 0.05;
  const stakesTerms = [...(opts.highStakesTerms ?? DEFAULT_HIGH_STAKES_TERMS), ...(opts.extraHighStakesTerms ?? [])];
  const stakesKinds = new Set((opts.highStakesKinds ?? []).map((k) => k.toLowerCase()));
  const keywords = extractKeywords(query, 12);
  const phrase = query.trim().toLowerCase();

  const seen = new Set<string>();
  const ranked: RankedMemory[] = [];
  for (const m of items) {
    if (!m || seen.has(m.id) || m.sourcePath === PROFILE_SOURCE_PATH) continue;
    seen.add(m.id);
    const titleTokens = tokenize(m.title ?? "");
    const bodyText = m.body ?? "";
    const allTokens = [...titleTokens, ...tokenize(bodyText)];
    const joined = `${m.title ?? ""} ${bodyText}`.toLowerCase();

    let rel = 0;
    if (keywords.length) {
      let hits = 0;
      for (const k of keywords) {
        if (titleTokens.some((t) => t.startsWith(k))) hits += 2;
        else if (allTokens.some((t) => t.startsWith(k))) hits += 1;
      }
      rel = hits / (2 * keywords.length);
      if (phrase.length >= 6 && joined.includes(phrase)) rel += 0.2;
      rel = Math.min(rel, 1);
    }

    const when = Date.parse(m.occurredAt ?? m.createdAt);
    const ageDays = Number.isFinite(when) ? Math.max(0, (now - when) / 86_400_000) : halfLife * 4;
    let fresh = Math.pow(0.5, ageDays / halfLife);
    const highStakes =
      stakesKinds.has(String(m.kind).toLowerCase()) || stakesTerms.some((t) => matchesTerm(allTokens, joined, t));
    if (highStakes) fresh = Math.max(fresh, floor);

    const score = wRel * rel + wFresh * fresh + (highStakes ? boost : 0);
    // Must be on-topic, or load-bearing. Fresh-but-irrelevant noise is dropped.
    if ((rel === 0 && !highStakes) || score < minScore) continue;
    ranked.push({ ...m, score, relevance: rel, freshness: fresh, highStakes });
  }
  ranked.sort((a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return ranked.slice(0, opts.topK ?? 5);
}
