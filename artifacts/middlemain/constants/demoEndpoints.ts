/**
 * Default endpoints for the companion apps. Override at build time with
 * EXPO_PUBLIC_AIS_AND_EARS_URL / EXPO_PUBLIC_MEMORY_MACHINE_URL.
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
