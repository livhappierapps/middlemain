import { fetch } from 'expo/fetch';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RETRYABLE_STATUS = new Set([429, 499, 502, 503, 504]);

export interface ResilientFetchOptions {
  timeoutMs?: number;
  /** Legacy total-attempt count. Zero disables retries but still sends once. */
  retries?: number;
  retryBaseMs?: number;
  onRetry?: (attempt: number, reason: string) => void;
}

export async function resilientFetch(
  url: string,
  init: NonNullable<Parameters<typeof fetch>[1]> = {},
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 30_000,
    retries = 3,
    retryBaseMs = 1_000,
    onRetry,
  } = options;

  let lastError: unknown;
  const attempts = Number.isFinite(retries) ? Math.max(1, Math.min(10, Math.floor(retries))) : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(tid);

      if (RETRYABLE_STATUS.has(resp.status) && attempt < attempts - 1) {
        await resp.body?.cancel().catch(() => {});
        const delay = retryBaseMs * Math.pow(2, attempt);
        onRetry?.(attempt + 1, `HTTP ${resp.status}`);
        await sleep(delay);
        continue;
      }

      return resp;
    } catch (err: any) {
      clearTimeout(tid);
      lastError = err;

      const isAbort = err?.name === 'AbortError';
      const reason = isAbort ? `timeout after ${timeoutMs}ms` : (err?.message ?? 'network error');

      if (attempt < attempts - 1) {
        const delay = retryBaseMs * Math.pow(2, attempt);
        onRetry?.(attempt + 1, reason);
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError ?? new Error('resilientFetch: max retries exceeded');
}

export async function resilientStreamFetch(
  url: string,
  init: NonNullable<Parameters<typeof fetch>[1]> = {},
  options: ResilientFetchOptions & { streamTimeoutMs?: number } = {},
): Promise<Response> {
  return resilientFetch(url, init, {
    ...options,
    timeoutMs: options.streamTimeoutMs ?? 60_000,
    retries: options.retries ?? 2,
  });
}
