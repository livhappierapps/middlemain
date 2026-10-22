export type ExpoSecureStoreModule = typeof import('expo-secure-store');
export type CredentialNamespace = 'ai-connection' | 'ais-and-ears-bridge' | 'memory-mcp';
export type CredentialState = 'secure' | 'cleared';

export interface MCPCredentialMetadata {
  url: string;
  legacyToken: string;
  credentialState?: CredentialState;
}

export function parseMCPCredentialMetadata(raw: string | null): MCPCredentialMetadata {
  if (raw === null) return { url: '', legacyToken: '' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Saved Memory Machine settings are invalid.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Saved Memory Machine settings are invalid.');
  }

  const saved = parsed as Record<string, unknown>;
  return {
    url: typeof saved.url === 'string' ? saved.url : '',
    legacyToken: typeof saved.token === 'string' ? saved.token.trim() : '',
    credentialState: saved.credentialState === 'secure' || saved.credentialState === 'cleared'
      ? saved.credentialState
      : undefined,
  };
}

export function serializeMCPCredentialMetadata(url: string, credentialState: CredentialState): string {
  return JSON.stringify({ url, credentialState });
}

export interface CredentialStore {
  get(namespace: CredentialNamespace, id: string): Promise<string | null>;
  set(namespace: CredentialNamespace, id: string, value: string): Promise<void>;
  delete(namespace: CredentialNamespace, id: string): Promise<void>;
}

export function createCredentialStore(
  platform: string,
  loadNativeStore: () => Promise<ExpoSecureStoreModule>,
  webSession = new Map<string, string>(),
): CredentialStore {
  const storageKey = (namespace: CredentialNamespace, id: string) =>
    `middlemain.credential.${namespace}.${encodeURIComponent(id)}`;

  return {
    async get(namespace, id) {
      const key = storageKey(namespace, id);
      if (platform === 'web') return webSession.get(key) ?? null;
      return (await loadNativeStore()).getItemAsync(key);
    },

    async set(namespace, id, value) {
      const key = storageKey(namespace, id);
      if (platform === 'web') {
        if (value) webSession.set(key, value);
        else webSession.delete(key);
        return;
      }

      const secureStore = await loadNativeStore();
      if (!(await secureStore.isAvailableAsync())) {
        throw new Error('OS secure storage is unavailable.');
      }

      const options = platform === 'ios'
        ? { keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
        : undefined;

      if (value) await secureStore.setItemAsync(key, value, options);
      else await secureStore.deleteItemAsync(key);
    },

    async delete(namespace, id) {
      const key = storageKey(namespace, id);
      if (platform === 'web') {
        webSession.delete(key);
        return;
      }
      await (await loadNativeStore()).deleteItemAsync(key);
    },
  };
}

export async function readOrMigrateCredential(
  store: CredentialStore,
  namespace: CredentialNamespace,
  id: string,
  legacyValue: string,
  state?: CredentialState,
): Promise<{ value: string; migratedLegacyValue: boolean; state: CredentialState }> {
  if (state === 'cleared') {
    await store.delete(namespace, id);
    return { value: '', migratedLegacyValue: false, state: 'cleared' };
  }

  const storedValue = await store.get(namespace, id);
  if (storedValue !== null) {
    return {
      value: storedValue,
      migratedLegacyValue: false,
      state: storedValue ? 'secure' : 'cleared',
    };
  }
  if (!legacyValue) {
    return { value: '', migratedLegacyValue: false, state: 'cleared' };
  }

  await store.set(namespace, id, legacyValue);
  return { value: legacyValue, migratedLegacyValue: true, state: 'secure' };
}
