/**
 * Bridge between Clerk (React hooks) and plain request helpers (AIContext,
 * CouncilContext). The Clerk session JWT is short-lived; Clerk refreshes it
 * silently from its SecureStore token cache, so chat never shows a re-auth
 * prompt. If no token is available the server falls back to its service key.
 */
type TokenGetter = () => Promise<string | null>;

let getter: TokenGetter | null = null;

export function setMemoryTokenGetter(next: TokenGetter | null): void {
  getter = next;
}

/** Resolves to the current Clerk JWT or null within `timeoutMs`. Never throws. */
export async function getMemoryToken(timeoutMs = 800): Promise<string | null> {
  if (!getter) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getter().catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Header for Middlemain's /grok/chat; the server forwards it to Memory Machine as Bearer. */
export async function memoryTokenHeader(): Promise<Record<string, string>> {
  const token = await getMemoryToken();
  return token ? { 'X-Memory-Token': token } : {};
}
