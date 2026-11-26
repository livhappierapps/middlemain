/**
 * Default endpoints for the companion apps. Override at build time with
 * EXPO_PUBLIC_AIS_AND_EARS_URL / EXPO_PUBLIC_MEMORY_MACHINE_URL (MCP endpoint used by
 * the Memory Bridge card on Connect) / EXPO_PUBLIC_MEMORY_MACHINE_API_URL (REST API
 * used for automatic memory in server Grok, set in Settings → Memory Machine).
 * Secrets (bridge key, MCP token) are never bundled: users enter them and
 * they are kept in device secure storage.
 */
const strip = (u: string) => u.trim().replace(/\/+$/, '');

export const DEFAULT_AIS_AND_EARS_URL = strip(
  process.env.EXPO_PUBLIC_AIS_AND_EARS_URL || 'https://aisandears.onrender.com',
);

export const DEFAULT_MEMORY_MACHINE_URL = strip(
  process.env.EXPO_PUBLIC_MEMORY_MACHINE_URL || 'https://the-memory-machine.replit.app/api/mcp',
);

/** Memory Machine REST API (livhappierapps/memory-machine). Empty until it is deployed. */
export const DEFAULT_MEMORY_MACHINE_API_URL = strip(process.env.EXPO_PUBLIC_MEMORY_MACHINE_API_URL || '');
