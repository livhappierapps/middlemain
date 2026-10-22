import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCredentialStore,
  parseMCPCredentialMetadata,
  readOrMigrateCredential,
  serializeMCPCredentialMetadata,
  type ExpoSecureStoreModule,
} from '../artifacts/middlemain/utils/secureCredentialStore';

function createNativeStore(available = true) {
  const values = new Map<string, string>();
  let setCount = 0;
  let lastOptions: unknown;
  const module = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    isAvailableAsync: async () => available,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string, options?: unknown) => {
      setCount += 1;
      lastOptions = options;
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      values.delete(key);
    },
  } as unknown as ExpoSecureStoreModule;

  return {
    module,
    values,
    get setCount() { return setCount; },
    get lastOptions() { return lastOptions; },
  };
}

test('iOS credentials use device-only keychain access and can be removed', async () => {
  const native = createNativeStore();
  const store = createCredentialStore('ios', async () => native.module);

  await store.set('ai-connection', 'conn id', 'provider-secret');
  assert.equal(native.values.get('middlemain.credential.ai-connection.conn%20id'), 'provider-secret');
  assert.equal(
    (native.lastOptions as { keychainAccessible?: string }).keychainAccessible,
    'device-only',
  );
  assert.equal(await store.get('ai-connection', 'conn id'), 'provider-secret');

  await store.delete('ai-connection', 'conn id');
  assert.equal(await store.get('ai-connection', 'conn id'), null);
});

test('web credentials remain in memory and never call native secure storage', async () => {
  const native = createNativeStore();
  let nativeLoadCount = 0;
  const loadNative = async () => {
    nativeLoadCount += 1;
    return native.module;
  };
  const firstSession = createCredentialStore('web', loadNative);

  await firstSession.set('ais-and-ears-bridge', 'primary', 'bridge-secret');
  await firstSession.set('memory-mcp', 'primary', 'memory-token');
  assert.equal(await firstSession.get('ais-and-ears-bridge', 'primary'), 'bridge-secret');
  assert.equal(await firstSession.get('memory-mcp', 'primary'), 'memory-token');
  assert.equal(nativeLoadCount, 0);
  assert.equal(native.setCount, 0);

  const nextSession = createCredentialStore('web', loadNative);
  assert.equal(await nextSession.get('ais-and-ears-bridge', 'primary'), null);
  assert.equal(await nextSession.get('memory-mcp', 'primary'), null);
});

test('legacy credentials migrate once and existing secure values take precedence', async () => {
  const native = createNativeStore();
  const store = createCredentialStore('android', async () => native.module);

  const first = await readOrMigrateCredential(store, 'ai-connection', 'one', 'legacy-key');
  assert.deepEqual(first, { value: 'legacy-key', migratedLegacyValue: true, state: 'secure' });
  assert.equal(native.setCount, 1);

  const second = await readOrMigrateCredential(store, 'ai-connection', 'one', 'stale-legacy-key');
  assert.deepEqual(second, { value: 'legacy-key', migratedLegacyValue: false, state: 'secure' });
  assert.equal(native.setCount, 1);
});

test('a cleared marker deletes stale secure credentials instead of restoring them', async () => {
  const native = createNativeStore();
  const key = 'middlemain.credential.ai-connection.one';
  native.values.set(key, 'old-secret');
  const store = createCredentialStore('android', async () => native.module);

  const result = await readOrMigrateCredential(store, 'ai-connection', 'one', 'legacy-secret', 'cleared');
  assert.deepEqual(result, { value: '', migratedLegacyValue: false, state: 'cleared' });
  assert.equal(native.values.has(key), false);
});

test('Memory Machine token migrates to secure storage and sanitized metadata omits it', async () => {
  const native = createNativeStore();
  const store = createCredentialStore('android', async () => native.module);
  const legacyToken = 'legacy-memory-token';
  const saved = parseMCPCredentialMetadata(JSON.stringify({
    url: 'https://memory.example/api/mcp',
    token: legacyToken,
  }));

  const credential = await readOrMigrateCredential(
    store,
    'memory-mcp',
    'primary',
    saved.legacyToken,
    saved.credentialState,
  );
  const metadata = serializeMCPCredentialMetadata(saved.url, credential.state);

  assert.equal(credential.value, legacyToken);
  assert.equal(await store.get('memory-mcp', 'primary'), legacyToken);
  assert.deepEqual(JSON.parse(metadata), {
    url: 'https://memory.example/api/mcp',
    credentialState: 'secure',
  });
  assert.equal(metadata.includes(legacyToken), false);
});

test('Memory Machine cleared marker takes precedence over a stale legacy token', async () => {
  const native = createNativeStore();
  const store = createCredentialStore('ios', async () => native.module);
  native.values.set('middlemain.credential.memory-mcp.primary', 'stale-secure-token');
  const saved = parseMCPCredentialMetadata(JSON.stringify({
    url: 'https://memory.example/api/mcp',
    token: 'stale-legacy-token',
    credentialState: 'cleared',
  }));
  const credential = await readOrMigrateCredential(
    store,
    'memory-mcp',
    'primary',
    saved.legacyToken,
    saved.credentialState,
  );

  assert.equal(credential.value, '');
  assert.equal(native.values.has('middlemain.credential.memory-mcp.primary'), false);
});

test('invalid Memory Machine settings are rejected before migration', () => {
  assert.throws(() => parseMCPCredentialMetadata('{broken'), /settings are invalid/i);
  assert.throws(() => parseMCPCredentialMetadata('[]'), /settings are invalid/i);
});

test('secure-storage unavailability fails closed without saving the credential', async () => {
  const native = createNativeStore(false);
  const store = createCredentialStore('android', async () => native.module);

  await assert.rejects(store.set('ai-connection', 'one', 'secret'), /secure storage is unavailable/i);
  assert.equal(native.setCount, 0);
});
