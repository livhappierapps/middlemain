import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { DEFAULT_MEMORY_MACHINE_API_URL } from '@/constants/demoEndpoints';
import { serverAuthHeaders } from '@/utils/serverAuth';

/**
 * Settings for the automatic Memory Machine context used by server Grok.
 * URL: AsyncStorage (not secret). Service key: device secure storage only
 * (native). The pair is pushed to Middlemain's API server, which is where the
 * injection actually happens (MEMORY_MACHINE_URL / MEMORY_MACHINE_SERVICE_KEY).
 */
const URL_KEY = '@middlemain/memoryMachineUrl';
const SERVICE_KEY_ID = 'middlemain.memoryMachine.serviceKey';
let webSessionKey = '';

export interface MemoryMachineSettings {
  url: string;
  serviceKey: string;
}

const normalize = (u: string) => u.trim().replace(/\/+$/, '');

export function isValidMemoryMachineUrl(url: string): boolean {
  return /^https:\/\/[^\s/@]+(\/\S*)?$/i.test(url.trim()) ||
    (__DEV__ && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(url.trim()));
}

async function secureStore() {
  if (Platform.OS === 'web') return null;
  const SecureStore = await import('expo-secure-store');
  return (await SecureStore.isAvailableAsync()) ? SecureStore : null;
}

export async function loadMemoryMachineSettings(): Promise<MemoryMachineSettings> {
  const url = (await AsyncStorage.getItem(URL_KEY)) ?? DEFAULT_MEMORY_MACHINE_API_URL;
  const store = await secureStore().catch(() => null);
  const serviceKey = store
    ? (await store.getItemAsync(SERVICE_KEY_ID, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY }).catch(() => null)) ?? ''
    : webSessionKey;
  return { url, serviceKey };
}

export async function saveMemoryMachineSettings(s: MemoryMachineSettings): Promise<void> {
  await AsyncStorage.setItem(URL_KEY, normalize(s.url));
  const key = s.serviceKey.trim();
  const store = await secureStore();
  if (!store) {
    webSessionKey = key; // web preview: memory only, never persisted
    return;
  }
  if (key) await store.setItemAsync(SERVICE_KEY_ID, key, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await store.deleteItemAsync(SERVICE_KEY_ID);
}

async function timedFetch(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface MemoryTestResult {
  reachable: boolean;
  /** null = no key entered, so not checked. */
  keyAccepted: boolean | null;
  message: string;
}

/** Test connection: GET /healthz, then (if a key is entered) GET /v1/me with it. */
export async function testMemoryMachine(s: MemoryMachineSettings): Promise<MemoryTestResult> {
  const base = normalize(s.url);
  if (!isValidMemoryMachineUrl(base)) return { reachable: false, keyAccepted: null, message: 'Enter an https:// Memory Machine URL.' };
  try {
    const health = await timedFetch(`${base}/healthz`);
    const ok = health.ok && ((await health.json().catch(() => null)) as { ok?: boolean } | null)?.ok === true;
    if (!ok) return { reachable: false, keyAccepted: null, message: `Memory Machine answered ${health.status}, not {ok: true}.` };
  } catch {
    return { reachable: false, keyAccepted: null, message: 'Could not reach Memory Machine. Check the URL and your connection.' };
  }
  if (!s.serviceKey.trim()) return { reachable: true, keyAccepted: null, message: 'Connected. No service key entered, so only your Apple sign-in will be used.' };
  try {
    const me = await timedFetch(`${base}/v1/me`, { headers: { 'x-mm-service-key': s.serviceKey.trim() } });
    if (me.ok) return { reachable: true, keyAccepted: true, message: 'Connected, and the service key works.' };
    return {
      reachable: true,
      keyAccepted: false,
      message: me.status === 401 ? 'Connected, but the service key was rejected.' : `Connected, but the key check returned ${me.status}.`,
    };
  } catch {
    return { reachable: true, keyAccepted: false, message: 'Connected, but the service key check failed.' };
  }
}

async function apiBase(): Promise<string> {
  const configured = await AsyncStorage.getItem('@middlemain/apiUrl');
  if (configured) return normalize(configured);
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}/api` : '/api';
}

/** Push URL + key to Middlemain's API server (owner executive key required). */
export async function pushMemoryConfigToServer(s: MemoryMachineSettings): Promise<{ ok: boolean; message: string }> {
  const base = await apiBase();
  let headers: Record<string, string>;
  try {
    headers = await serverAuthHeaders(base);
  } catch {
    return { ok: false, message: 'Saved on this phone. Add your executive key (Settings → Executive API) so the server can use it.' };
  }
  try {
    const res = await timedFetch(`${base}/memory/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: normalize(s.url) || null, serviceKey: s.serviceKey.trim() || null }),
    }, 15_000);
    if (res.ok) return { ok: true, message: 'Saved and sent to the Middlemain server. Server Grok will now use your memories.' };
    return { ok: false, message: res.status === 401 ? 'Saved on this phone, but the server rejected your executive key.' : `Saved on this phone, but the server answered ${res.status}.` };
  } catch {
    return { ok: false, message: 'Saved on this phone, but the server could not be reached. It will retry next launch.' };
  }
}

/** Fire-and-forget on launch: the server keeps the pushed values only until it restarts. */
export async function syncMemoryConfigOnLaunch(): Promise<void> {
  try {
    const s = await loadMemoryMachineSettings();
    if (!s.url || !(await AsyncStorage.getItem('@middlemain_executive_key'))) return;
    await pushMemoryConfigToServer(s);
  } catch {
    // Silent by design: memory is optional.
  }
}
