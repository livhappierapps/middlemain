/** Connectivity checks never replay a chat, media upload, or tool action. */
export function bridgeQuality(ping: number | null): 'good' | 'fair' | 'poor' | 'offline' {
  if (ping === null) return 'offline';
  return ping > 1000 ? 'poor' : ping > 500 ? 'fair' : 'good';
}

export function bridgeRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** Math.min(Math.max(0, attempt), 5), 30_000);
}

export class BridgeHandshakeError extends Error {
  constructor(message: string, public readonly retryable = true) { super(message); }
}

export async function bridgeHandshake(
  baseUrl: string,
  provider: string,
  apiKey: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<number> {
  if (!/^https:\/\//i.test(baseUrl) &&
      !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(baseUrl)) {
    throw new BridgeHandshakeError('Handshake requires a secure API URL.', false);
  }
  const base = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = provider === 'server' ? {}
    : provider === 'anthropic'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` };
  const start = Date.now();
  // Server status and provider model lists do not generate an AI reply.
  const response = await request(`${base}/${provider === 'server' ? 'grok/status' : 'models'}`, {
    method: 'GET', headers, signal, redirect: 'error',
  });
  // Consume the small response before timing, without logging its contents.
  await response.text();
  if (!response.ok) {
    throw new BridgeHandshakeError(`Handshake HTTP ${response.status}.`,
      response.status === 408 || response.status === 429 || response.status >= 500);
  }
  return Date.now() - start;
}

/** One request at a time; stopping cancels both the timer and in-flight request. */
export function monitorBridge(options: {
  handshake: (signal: AbortSignal) => Promise<number>;
  sample: (ping: number | null) => void;
  log: (message: string) => void;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const run = async () => {
    if (stopped) return;
    controller = new AbortController();
    const timeout = schedule(() => controller?.abort(), 10_000);
    let delay = 8_000;
    let retry = false;
    try {
      const ping = await options.handshake(controller.signal);
      if (stopped) return;
      options.sample(ping);
      retry = ping > 500;
      if (retry) options.log(`Handshake latency ${ping}ms; keeping the selected key.`);
      else if (attempt) options.log(`Handshake recovered (${ping}ms); retry backoff reset.`);
    } catch (error) {
      if (stopped) return;
      options.sample(null);
      // Never echo network exception strings, URLs, headers, or provider bodies.
      const permanent = error instanceof BridgeHandshakeError && !error.retryable;
      options.log(permanent ? `${(error as BridgeHandshakeError).message} Check Connect settings; retries paused.`
        : 'Handshake unavailable or timed out; keeping the selected key.');
      if (permanent) return;
      retry = true;
    } finally {
      cancel(timeout);
    }
    if (stopped) return;
    if (retry) {
      delay = bridgeRetryDelay(attempt++);
      options.log(`Handshake retry #${attempt} scheduled in ${delay / 1000}s (same connection).`);
    } else attempt = 0;
    timer = schedule(() => {
      if (attempt) options.log(`Handshake retry #${attempt} started (same connection).`);
      void run();
    }, delay);
  };
  void run();
  return () => {
    stopped = true;
    if (timer !== undefined) cancel(timer);
    controller?.abort();
  };
}
