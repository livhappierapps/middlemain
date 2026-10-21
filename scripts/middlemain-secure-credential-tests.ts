import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCredentialStore,
  readOrMigrateCredential,
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
  assert.equal(await firstSession.get('ais-and-ears-bridge', 'primary'), 'bridge-secret');
  assert.equal(nativeLoadCount, 0);
  assert.equal(native.setCount, 0);

  const nextSession = createCredentialStore('web', loadNative);
  assert.equal(await nextSession.get('ais-and-ears-bridge', 'primary'), null);
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

test('secure-storage unavailability fails closed without saving the credential', async () => {
  const native = createNativeStore(false);
  const store = createCredentialStore('android', async () => native.module);

  await assert.rejects(store.set('ai-connection', 'one', 'secret'), /secure storage is unavailable/i);
  assert.equal(native.setCount, 0);
});
