import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'council-history-'));
const source = await readFile(new URL('../artifacts/middlemain/utils/councilHistory.ts', import.meta.url), 'utf8');
const target = join(temp, 'history.mjs');
await writeFile(target, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText);
const { councilHistory, councilApiBase } = await import(pathToFileURL(target).href);
after(() => rm(temp, { recursive: true, force: true }));

test('native Council requires a configured absolute URL and normalizes host input', () => {
  assert.equal(councilApiBase('', 'example.com', 'ios'), 'https://example.com/api');
  assert.equal(councilApiBase('', 'https://example.com', 'android'), 'https://example.com/api');
  assert.equal(councilApiBase('https://example.com/api/', undefined, 'ios'), 'https://example.com/api');
  assert.throws(() => councilApiBase('', undefined, 'ios'), /not configured/);
  assert.throws(() => councilApiBase('https://user:secret@example.com', undefined, 'ios'));
  assert.equal(councilApiBase('', undefined, 'web'), '/api');
});

test('Council retains other participants and explicitly recalled memories', () => {
  const result = councilHistory('leo', [
    { role: 'system', content: 'connected' },
    { role: 'system', content: 'project uses Expo', sharedContext: true },
    { role: 'ai', participantId: 'other', participantName: 'Helper', content: 'Check permissions' },
    { role: 'ai', participantId: 'leo', content: 'I agree' },
    { role: 'user', content: 'What next?' },
  ]);
  assert.equal(result.length, 3);
  assert.match(result[0].content, /project uses Expo/);
  assert.match(result[0].content, /\[Helper\]: Check permissions/);
  assert.doesNotMatch(result[0].content, /connected/);
  assert.equal(result[1].role, 'assistant');
  assert.ok(result.every(m => m.role !== 'system'));
});

test('unfinished and empty replies never become model history', () => {
  assert.deepEqual(councilHistory('leo', [
    { role: 'ai', participantId: 'leo', content: 'partial', streaming: true },
    { role: 'user', content: '  ' },
  ]), []);
});
