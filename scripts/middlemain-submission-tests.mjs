import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('EAS signing setup restricts temporary keys, clears CI, redacts identifiers, and cleans up', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signing-test-'));
  try {
    const record = join(dir, 'key-path');
    writeFileSync(join(dir, 'script'), `#!/usr/bin/env node
const fs = require('node:fs');
if ('CI' in process.env) process.exit(3);
const keyPath = process.env.EXPO_ASC_API_KEY_PATH;
if ((fs.statSync(keyPath).mode & 0o777) !== 0o600) process.exit(4);
fs.writeFileSync(process.env.TEST_KEY_PATH_RECORD, keyPath);
console.log('Using key ' + process.env.EXPO_ASC_KEY_ID);
console.log('All credentials are ready to build');
`, { mode: 0o700 });
    const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const id = randomUUID();
    const result = spawnSync(process.execPath, ['artifacts/middlemain/scripts/configure-ios-signing.mjs'], {
      encoding: 'utf8', timeout: 15_000, env: {
        ...process.env, PATH: `${dir}:${process.env.PATH}`, CI: '',
        ASC_PRIVATE_KEY: key, ASC_KEY_ID: id, ASC_ISSUER_ID: randomUUID(),
        TEST_KEY_PATH_RECORD: record,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /All credentials are ready/);
    assert.ok(!result.stdout.includes(id) && !result.stdout.includes(key));
    assert.ok(!existsSync(readFileSync(record, 'utf8')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('in-app data summary discloses remote storage instead of claiming no collection', () => {
  const legal = readFileSync('artifacts/middlemain/app/legal.tsx', 'utf8');
  assert.match(legal, /backend stores room names/);
  assert.match(legal, /uninstalling does not delete copies/);
  assert.match(legal, /apps\/middlemain\/privacypolicy/);
  assert.doesNotMatch(legal, /INFORMATION WE DO NOT COLLECT|Since we do not collect your data/);
  assert.match(legal, /subscriptions are not enabled in this build/);
});

test('EAS pins the package manager that reads the repository security overrides', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const eas = JSON.parse(readFileSync('artifacts/middlemain/eas.json', 'utf8'));
  assert.equal(pkg.packageManager, 'pnpm@10.26.1');
  for (const profile of ['development', 'preview', 'production']) {
    assert.equal(eas.build[profile].pnpm, '10.26.1');
  }
  assert.ok(pkg.pnpm.overrides && pkg.pnpm.patchedDependencies);
});
