import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'middlemain-stability-'));
const source = await readFile(new URL('../artifacts/middlemain/utils/bridgeStability.ts', import.meta.url), 'utf8');
const target = join(temp, 'stability.mjs');
await writeFile(target, ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText);
const { bridgeQuality, bridgeRetryDelay, bridgeHandshake, BridgeHandshakeError, monitorBridge } =
  await import(pathToFileURL(target).href);
after(() => rm(temp, { recursive: true, force: true }));

test('quality uses strict >500ms yellow and >1000ms red boundaries', () => {
  for (const [ping, quality] of [[0, 'good'], [500, 'good'], [501, 'fair'], [1000, 'fair'], [1001, 'poor'], [null, 'offline']]) {
    assert.equal(bridgeQuality(ping), quality);
  }
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => bridgeRetryDelay(i)),
    [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000]);
});

function harness(handshake) {
  const timers = [];
  const logs = [];
  const samples = [];
  const stop = monitorBridge({
    handshake, log: value => logs.push(value), sample: value => samples.push(value),
    schedule: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    cancel: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const next = async () => { const timer = timers.shift(); assert.ok(timer); timer.fn(); await settle(); return timer.ms; };
  return { timers, logs, samples, stop, settle, next };
}

test('slow handshakes back off, cap, log every retry, and reset after recovery', async () => {
  let latency = 750;
  let calls = 0;
  const h = harness(async () => { calls++; return latency; });
  await h.settle();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    assert.equal(await h.next(), delay);
  }
  assert.equal(calls, 8);
  assert.equal(h.logs.filter(line => /started/.test(line)).length, 7);
  assert.equal(h.logs.filter(line => /scheduled/.test(line)).length, 8);
  latency = 500;
  await h.next();
  assert.equal(h.timers[0].ms, 8000);
  assert.match(h.logs.at(-1), /recovered/);
  latency = 1001;
  await h.next();
  assert.equal(h.timers[0].ms, 1000);
  h.stop();
  assert.equal(h.timers.length, 0);
});

test('transport failures retry without leaking secrets; permanent auth/config failures stop', async () => {
  const h = harness(async () => { throw new Error('SECRET_TOKEN https://secret.example'); });
  await h.settle();
  assert.equal(h.timers[0].ms, 1000);
  assert.deepEqual(h.samples, [null]);
  assert.doesNotMatch(h.logs.join(' '), /SECRET_TOKEN|secret\.example/);
  h.stop();
  const denied = harness(async () => { throw new BridgeHandshakeError('Handshake HTTP 401.', false); });
  await denied.settle();
  assert.equal(denied.timers.length, 0);
  assert.match(denied.logs[0], /retries paused/);
  denied.stop();
});

test('stopping on blur/background/connection change aborts in-flight work and ignores late completion', async () => {
  let resolve;
  let signal;
  const h = harness(s => { signal = s; return new Promise(r => { resolve = r; }); });
  h.stop();
  assert.equal(signal.aborted, true);
  resolve(1500);
  await h.settle();
  assert.equal(h.logs.length, 0);
  assert.equal(h.samples.length, 0);
  assert.equal(h.timers.length, 0);
});

test('handshakes use metadata GETs and never chat, tools, or a different credential', async () => {
  for (const provider of ['xai', 'openai', 'anthropic', 'gemini', 'custom', 'server']) {
    let calls = 0;
    const ping = await bridgeHandshake('https://api.example/v1', provider, 'selected-key',
      new AbortController().signal, async (url, init) => {
        calls++;
        assert.equal(url, `https://api.example/v1/${provider === 'server' ? 'grok/status' : 'models'}`);
        assert.equal(init.method, 'GET');
        assert.equal(init.body, undefined);
        assert.equal(init.redirect, 'error');
        if (provider === 'anthropic') assert.equal(init.headers['x-api-key'], 'selected-key');
        else if (provider !== 'server') assert.equal(init.headers.Authorization, 'Bearer selected-key');
        else assert.deepEqual(init.headers, {});
        return new Response('{}');
      });
    assert.equal(calls, 1);
    assert.ok(ping >= 0);
  }
});

test('HTTP failures redact bodies and classify retryable statuses', async () => {
  for (const status of [401, 403, 404, 408, 429, 500]) {
    await assert.rejects(bridgeHandshake('https://api.example', 'xai', 'key',
      new AbortController().signal, async () => new Response('SECRET', { status })), error => {
      assert.equal(error.retryable, [408, 429, 500].includes(status));
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    });
  }
});

test('terminal server key is opt-in, selection-guarded, with no automatic fallback', async () => {
  const terminal = await readFile(new URL('../artifacts/middlemain/app/(tabs)/terminal.tsx', import.meta.url), 'utf8');
  assert.match(terminal, /\[serverKeyOptIn, setServerKeyOptIn\] = useState\(false\)/);
  assert.match(terminal, /requestedConn\?\.provider === 'server' && !serverKeyOptIn \? null/);
  assert.match(terminal, /conn\.provider === 'server' && !serverKeyOptIn/);
  assert.match(terminal, /AppState\.addEventListener/);
  assert.match(terminal, /useFocusEffect/);
  assert.doesNotMatch(source, /sendMessage|callAI|serverKey/);
});
