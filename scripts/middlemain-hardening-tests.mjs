import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'middlemain-hardening-'));
const originalFetch = globalThis.fetch;
const key = randomUUID();
const storage = new Map([['@middlemain/apiUrl', 'https://trusted.example/api'], ['@middlemain_executive_key', key]]);
globalThis.__middlemainTestStorage = { getItem: async name => storage.get(name) ?? null };
async function load(file, name) {
  const source = (await readFile(new URL(`../artifacts/middlemain/${file}.ts`, import.meta.url), 'utf8'))
    .replace("import { fetch } from 'expo/fetch';", 'const fetch = (...args) => globalThis.fetch(...args);')
    .replace("import AsyncStorage from '@react-native-async-storage/async-storage';", 'const AsyncStorage = globalThis.__middlemainTestStorage;')
    .replace("'../constants/appGuide'", "'./appGuide.mjs'");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const target = join(temp, `${name}.mjs`);
  await writeFile(target, output);
  return import(pathToFileURL(target).href);
}
const guide = await load('constants/appGuide', 'appGuide');
const help = await load('utils/appHelp', 'appHelp');
const auth = await load('utils/serverAuth', 'serverAuth');
const network = await load('utils/resilientFetch', 'resilientFetch');
const { streamSSE } = await load('utils/streamSSE', 'streamSSE');
after(async () => {
  globalThis.fetch = originalFetch;
  delete globalThis.__middlemainTestStorage;
  await rm(temp, { recursive: true, force: true });
});

test('canonical guide includes all main surfaces and offline answers make no requests', () => {
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('Unexpected network request'); };
  assert.equal(guide.APP_GUIDE_SECTIONS.length, 11);
  for (const title of ['Home', 'Connect', 'Bridge', 'AIs & Ears', 'Memory', 'Council', 'Go Live', 'Webhooks', 'Debug', 'Guide', 'Settings']) {
    assert.ok(guide.APP_GUIDE_SECTIONS.some(section => section.title.includes(title)), title);
  }
  assert.match(help.getOfflineHelpAnswer('private GitHub sign-in'), /registered.*GitHub App/);
  assert.match(help.getOfflineHelpAnswer('memory bridge advertised MCP tools'), /advertised tools/);
  assert.match(help.getOfflineHelpAnswer('monthly purchases restore'), /not connected to StoreKit/);
  assert.equal(calls, 0);
});

test('AI retrieval is relevant, bounded, and absent for unrelated paid prompts', () => {
  assert.equal(help.appHelpContext('Explain the Pythagorean theorem'), '');
  assert.equal(help.appHelpContext('Debug this JavaScript error'), '');
  const context = help.appHelpContext('How do I use Middlemain private GitHub sign-in?');
  assert.match(context, /read-only Contents/);
  assert.ok(context.length < 7_500);
  assert.match(help.appHelpContext('how do purchases work', true), /not connected to StoreKit/);
});

test('owner key goes only to the trusted API, and unsafe URLs fail', async () => {
  assert.equal((await auth.serverAuthHeaders('https://trusted.example/api/'))['X-Executive-Key'], key);
  await assert.rejects(auth.serverAuthHeaders('https://untrusted.example/api'), /authorization/);
  await assert.rejects(auth.serverAuthHeaders('http://trusted.example/api', key), /HTTPS/);
  await assert.rejects(auth.serverAuthHeaders('//untrusted.example/api', key), /Protocol-relative/);
});

test('zero retries sends once, including provider failure; it never silently skips a paid request', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('busy', { status: 503 }); };
  const response = await network.resilientFetch('https://provider.example', { method: 'POST' }, { retries: 0 });
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('mock disconnect'); };
  await assert.rejects(network.resilientFetch('https://provider.example', {}, { retries: 0 }), /mock disconnect/);
  assert.equal(calls, 1);
});

async function readStream(chunks, idleMs = 100) {
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); },
    cancel() { cancelled = true; },
  });
  const output = [];
  let completed = 0;
  const errors = [];
  await streamSSE(new Response(body), text => output.push(text), () => completed++, error => errors.push(error), idleMs);
  return { output: output.join(''), completed, errors, cancelled };
}

test('shared SSE supports split UTF-8/events, Anthropic deltas, and DONE without hanging', async () => {
  const result = await readStream([
    'data:{"choices":[{"delta":{"content":"Hel',
    'lo"}}]}\r\n', 'data: {"delta":{"text":" world"}}\n', 'data: [DONE]\n',
  ]);
  assert.equal(result.output, 'Hello world');
  assert.equal(result.completed, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(result.cancelled, true);
});

test('shared SSE exposes provider errors and cancels stalled streams', async () => {
  const failed = await readStream(['data: {"error":{"message":"mock provider failure"}}\n']);
  assert.equal(failed.completed, 0);
  assert.deepEqual(failed.errors, ['mock provider failure']);
  const stalled = await readStream([], 10);
  assert.match(stalled.errors[0], /timed out/);
  assert.equal(stalled.cancelled, true);
});

test('shared SSE flushes a final event without newline and limits malicious buffering', async () => {
  let output = '';
  let done = 0;
  const complete = new Response('data: {"choices":[{"delta":{"content":"tail"}}]}');
  await streamSSE(complete, text => output += text, () => done++, assert.fail);
  assert.equal(output, 'tail');
  assert.equal(done, 1);
  const oversized = await readStream(['x'.repeat(1_000_001)]);
  assert.match(oversized.errors[0], /safe size limit/);
});
