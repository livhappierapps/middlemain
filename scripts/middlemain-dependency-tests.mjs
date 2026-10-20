import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url).pathname;
function patchedModule(name, version) {
  const entry = readdirSync(join(root, 'node_modules/.pnpm'))
    .find(directory => directory.startsWith(`${name}@${version}_patch_hash=`));
  assert.ok(entry, `Missing installed patch for ${name}`);
  return join(root, 'node_modules/.pnpm', entry, 'node_modules', name);
}
const imageModule = patchedModule('image-size', '1.2.1');
const bracesModule = patchedModule('braces', '3.0.3');

test('image-size patch keeps PNG dimensions and rejects zero-length JXL/HEIF/ICNS boxes promptly', () => {
  const imageSize = require(imageModule);
  const png = readFileSync(join(root, 'artifacts/middlemain/assets/images/icon.png'));
  const size = imageSize(png);
  assert.ok(size.width > 0 && size.height > 0);
  const proof = `
    const assert = require('node:assert/strict');
    const size = require(${JSON.stringify(imageModule)});
    const box = (type, length, payload = '') => {
      const b = Buffer.alloc(Math.max(8, payload.length + 8));
      b.writeUInt32BE(length); b.write(type, 4); b.write(payload, 8); return b;
    };
    const jxl = Buffer.concat([box('JXL ', 12, 'xxxx'), box('ftyp', 16, 'jxl xxxx'), box('jxlp', 0, 'xxxx')]);
    const heif = box('ftyp', 0, 'heicxxxx');
    const icns = Buffer.concat([box('icns', 24), box('icp4', 8), box('icp4', 0)]);
    for (const input of [jxl, heif, icns]) assert.throws(() => size(input));
  `;
  const result = spawnSync(process.execPath, ['-e', proof], { timeout: 2_000, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
});

test('brace compiler preserves normal expansion and bounds brace and parenthesis nesting', () => {
  const braces = require(bracesModule);
  assert.deepEqual(braces('{a,b}', { expand: true }), ['a', 'b']);
  for (const options of [{}, { expand: true }]) {
    assert.throws(() => braces('{'.repeat(1000) + 'a,b' + '}'.repeat(1000), options), /maximum nesting/);
    assert.throws(() => braces('('.repeat(1000) + 'a' + ')'.repeat(1000), options), /maximum nesting/);
  }
});

test('root overrides stay synchronized and macOS EAS dependencies remain included', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  for (const [name, value] of Object.entries(pkg.pnpm.overrides)) {
    assert.ok(workspace.includes(`${name}: ${value}`) || workspace.includes(`${name}: '${value}'`) ||
      workspace.includes(`'${name}': '${value}'`) || workspace.includes(`'${name}': ${value}`), name);
  }
  assert.equal(pkg.pnpm.overrides['@esbuild/darwin-arm64'], undefined);
  assert.equal(pkg.pnpm.overrides['lightningcss-darwin-arm64'], undefined);
  assert.ok(pkg.devDependencies['eas-cli']);
  assert.equal(pkg.dependencies?.['eas-cli'], undefined);
});
