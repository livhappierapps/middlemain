import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';

test('submission dry run restricts key permissions, preserves tracked config, and removes temporary credentials', () => {
  const script = new URL('../artifacts/middlemain/scripts/submit-ios.sh', import.meta.url).pathname;
  const config = new URL('../artifacts/middlemain/eas.json', import.meta.url);
  const before = readFileSync(config, 'utf8');
  const dirs = () => readdirSync(tmpdir()).filter(name => name.startsWith('middlemain-submit.'));
  const oldDirs = dirs();
  const fakeKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const result = spawnSync('bash', [script], { encoding: 'utf8', timeout: 10_000, env: {
    ...process.env, ASC_KEY_ID: randomUUID(), ASC_ISSUER_ID: randomUUID(),
    ASC_PRIVATE_KEY: fakeKey, ASC_APP_ID: '123456789',
    MIDDLEMAIN_SUBMIT_DRY_RUN: '1',
  } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no submission started/);
  assert.ok(!result.stdout.includes(fakeKey));
  assert.equal(readFileSync(config, 'utf8'), before);
  assert.deepEqual(dirs(), oldDirs);
});

test('failed submission preparation cleans up and never prints supplied secret values', () => {
  const script = new URL('../artifacts/middlemain/scripts/submit-ios.sh', import.meta.url).pathname;
  const dirs = () => readdirSync(tmpdir()).filter(name => name.startsWith('middlemain-submit.'));
  const before = dirs();
  const key = randomUUID();
  const result = spawnSync('bash', [script], { encoding: 'utf8', timeout: 10_000, env: {
    ...process.env, ASC_KEY_ID: randomUUID(), ASC_ISSUER_ID: randomUUID(),
    ASC_PRIVATE_KEY: key, ASC_APP_ID: 'invalid',
    MIDDLEMAIN_SUBMIT_DRY_RUN: '1',
  } });
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes(key) && !result.stderr.includes(key));
  assert.deepEqual(dirs(), before);
});
