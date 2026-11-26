import type { Memory, Profile } from "./types";

/**
 * Minimal zero-dep Memory Machine client for the injection layer. Mirrors the
 * shape of memory-machine's packages/api-client (which is private and not
 * published), plus a hard per-request timeout so callers never hang on it.
 */
export interface MemoryClientOptions {
  baseUrl: string;
  /** Clerk session JWT for the signed-in user (sent as Bearer). Preferred. */
  getToken?: () => Promise<string | null | undefined> | string | null | undefined;
  /** Server-to-server key, sent as `x-mm-service-key` when there is no token. Server-side only. */
  serviceKey?: string;
  /** Per-request timeout in ms. Default 1500. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class MemoryApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`Memory Machine API ${status}`);
    this.name = "MemoryApiError";
  }
}

export interface ListQuery {
  search?: string;
  limit?: number;
  before?: string;
  /** "any" = match any word (ranked server-side); default is whole-phrase. */
  match?: "phrase" | "any";
}

export type MemoryClient = ReturnType<typeof createMemoryClient>;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function createMemoryClient(opts: MemoryClientOptions) {
  const f = opts.fetch ?? fetch;
  const base = normalizeBaseUrl(opts.baseUrl);
  const timeoutMs = opts.timeoutMs ?? 1500;

  async function call<T>(path: string, init: RequestInit = {}, timeout = timeoutMs): Promise<T> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new Error("memory_timeout"));
      }, timeout);
    });
    try {
      const token = opts.getToken ? await Promise.race([Promise.resolve(opts.getToken()), expire]) : null;
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      else if (opts.serviceKey) headers.set("x-mm-service-key", opts.serviceKey);
      if (typeof init.body === "string") headers.set("content-type", "application/json");
      const res = await Promise.race([f(`${base}${path}`, { ...init, headers, signal: controller?.signal }), expire]);
      const text = await Promise.race([res.text(), expire]);
      const body = text ? safeJson(text) : null;
      if (!res.ok) throw new MemoryApiError(res.status, body);
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    health: (timeout?: number) => call<{ ok: boolean }>("/healthz", {}, timeout),
    me: () => call<{ id: string; email: string | null }>("/v1/me"),
    listMemories: (q: ListQuery = {}, timeout?: number) => {
      const p = new URLSearchParams();
      if (q.search) p.set("q", q.search);
      if (q.match) p.set("match", q.match);
      if (q.limit) p.set("limit", String(Math.min(Math.max(Math.trunc(q.limit), 1), 200)));
      if (q.before) p.set("before", q.before);
      const s = p.toString();
      return call<{ items: Memory[] }>(`/v1/memories${s ? `?${s}` : ""}`, {}, timeout);
    },
    /** Returns null when no profile has been built yet (404). */
    getProfile: async (timeout?: number): Promise<Profile | null> => {
      try {
        return await call<Profile>("/v1/profile", {}, timeout);
      } catch (err) {
        if (err instanceof MemoryApiError && err.status === 404) return null;
        throw err;
      }
    },
    putProfile: (body: string, metadata: Record<string, unknown>, timeout?: number) =>
      call<Profile>("/v1/profile", { method: "PUT", body: JSON.stringify({ body, metadata }) }, timeout),
  };
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
