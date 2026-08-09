/**
 * Runtime XAI API key store.
 * Lets the app push a fresh key from the phone without restarting the server.
 * Falls back to the XAI_API_KEY env var when no runtime key has been set.
 */

let _runtimeKey: string | null = null;

export function getXaiKey(): string | undefined {
  return _runtimeKey ?? process.env["XAI_API_KEY"] ?? undefined;
}

export function setXaiKey(key: string): void {
  _runtimeKey = key.trim() || null;
}

export function hasXaiKey(): boolean {
  return !!(_runtimeKey ?? process.env["XAI_API_KEY"]);
}
