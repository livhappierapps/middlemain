import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { createRateLimiter } from '../artifacts/api-server/src/lib/security';
import { validateArchiveUrl } from '../artifacts/api-server/src/routes/download';
import { ANDROID_APK_URL } from '../artifacts/api-server/src/lib/androidRelease';

const key = randomUUID();
const testDir = mkdtempSync(join(tmpdir(), 'middlemain-api-tests-'));
process.env.MIDDLEMAIN_ROOM_STORE_PATH = join(testDir, 'rooms.json');
process.env.LEO_EXECUTIVE_KEY = key;
process.env.XAI_API_KEY = randomUUID();
process.env.NODE_ENV = 'test';
const originalFetch = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith('https://api.x.ai/')) {
    providerCalls++;
    return new globalThis.Response(JSON.stringify({ choices: [{ message: { content: 'mock response' } }] }),
      { headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(input, init);
};
const { default: app } = await import('../artifacts/api-server/src/app');
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  rmSync(testDir, { recursive: true, force: true });
});

test('anonymous and invalid-key callers cannot spend owner credits or poison webhook inbox', async () => {
  for (const path of ['/grok/chat', '/executive/chat', '/executive/webhook/council', '/executive/webhook/test']) {
    for (const headers of [{}, { 'x-executive-key': 'not-the-owner' }]) {
      const response = await fetch(base + path, { method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'mock' }] }),
      });
      assert.equal(response.status, 401, path);
      assert.match((await response.json()).error, /authorization required/i);
    }
  }
  assert.equal(providerCalls, 0);
});

test('authorized chat validates input and reaches only the mocked provider once', async () => {
  const headers = { 'content-type': 'application/json', 'x-executive-key': key };
  const invalid = await fetch(base + '/grok/chat', { method: 'POST', headers,
    body: JSON.stringify({ messages: [{ role: 'invalid', content: 'mock' }] }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(providerCalls, 0);
  const valid = await fetch(base + '/grok/chat', { method: 'POST', headers,
    body: JSON.stringify({ messages: [{ role: 'user', content: 'mock' }], stream: false }),
  });
  assert.equal(valid.status, 200);
  assert.equal(providerCalls, 1);
});

test('malformed JSON errors omit stacks and hardened response headers are present', async () => {
  const response = await fetch(base + '/grok/chat', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: '{"broken"',
  });
  assert.equal(response.status, 400);
  const body = await response.text();
  assert.ok(!body.includes('SyntaxError') && !body.includes('/home/'));
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('production-like download serves only the approved APK or fails explicitly', async () => {
  const response = await fetch(base + '/download/android', { signal: AbortSignal.timeout(30_000) });
  if (!ANDROID_APK_URL) {
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('eas'));
    return;
  }
  assert.equal(validateArchiveUrl(ANDROID_APK_URL).hostname, 'expo.dev');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
  const reader = response.body!.getReader();
  const prefix: number[] = [];
  try {
    while (prefix.length < 4) {
      const chunk = await reader.read();
      assert.ok(!chunk.done, 'APK ended before its ZIP header');
      prefix.push(...chunk.value!.subarray(0, 4 - prefix.length));
    }
    assert.deepEqual(prefix, [0x50, 0x4b, 0x03, 0x04]);
  } finally {
    await reader.cancel(); // Verify bytes without downloading the entire APK.
  }
});

test('room links cannot forge AI publications; host and MCP credentials are separate', async () => {
  const created = await fetch(base + '/council/rooms', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mock room' }),
  });
  assert.equal(created.status, 200);
  const room = await created.json();
  assert.match(room.roomId, /^[A-Za-z0-9_-]{24}$/);
  const path = `/council/rooms/${room.roomId}`;
  const body = JSON.stringify({ role: 'ai', content: 'mock', messageId: 'test-stream' });
  for (const key of ['', room.mcpAccessToken]) {
    for (const route of ['/messages', '/streaming/start', '/streaming/chunk', '/streaming/end']) {
      const response = await fetch(base + path + route, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-room-key': key }, body,
      });
      assert.equal(response.status, 401);
    }
  }
  const published = await fetch(base + path + '/messages', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-room-key': room.hostAccessToken }, body,
  });
  assert.equal(published.status, 200);
  const history = await (await fetch(base + path)).json();
  assert.ok(!JSON.stringify(history).includes(room.hostAccessToken));
  assert.ok(!JSON.stringify(history).includes(room.mcpAccessToken));
  const agentBody = JSON.stringify({ name: 'Mock agent', message: 'mock agent output' });
  const anonymousAgent = await fetch(base + path + '/agent', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: agentBody });
  assert.equal(anonymousAgent.status, 401);
  const authorizedAgent = await fetch(base + path + '/agent', { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${room.mcpAccessToken}` }, body: agentBody });
  assert.equal(authorizedAgent.status, 200);
});

test('oversized persistence fails without replacing saved history', async () => {
  const { saveRooms } = await import('../artifacts/api-server/src/lib/roomStore');
  const { readFileSync } = await import('node:fs');
  const before = readFileSync(process.env.MIDDLEMAIN_ROOM_STORE_PATH!, 'utf8');
  assert.throws(() => saveRooms(new Map([['oversized', {
    id: 'oversized', name: 'mock', createdAt: 'mock', messages: [{
      id: 'mock', role: 'user' as const, content: 'x'.repeat(16 * 1024 * 1024), timestamp: 'mock',
    }],
  }]])), /could not be saved/);
  assert.equal(readFileSync(process.env.MIDDLEMAIN_ROOM_STORE_PATH!, 'utf8'), before);
});

test('archive URLs and limiter reject unsafe destinations and excessive callers', () => {
  assert.equal(validateArchiveUrl('https://expo.dev/artifacts/eas/example.apk').hostname, 'expo.dev');
  assert.equal(validateArchiveUrl('https://storage.googleapis.com/example.apk').hostname, 'storage.googleapis.com');
  assert.equal(validateArchiveUrl('https://wf-artifacts.eascdn.net/builds/example.apk').hostname, 'wf-artifacts.eascdn.net');
  assert.throws(() => validateArchiveUrl('https://wf-artifacts.eascdn.net.evil.example/example.apk'));
  assert.throws(() => validateArchiveUrl('https://evil.wf-artifacts.eascdn.net/example.apk'));
  for (const url of ['http://expo.dev/a.apk', 'https://127.0.0.1/a.apk', 'https://expo.dev.evil.test/a.apk', 'https://user:password@expo.dev/a.apk', 'https://expo.dev:444/a.apk']) {
    assert.throws(() => validateArchiveUrl(url), /Untrusted/);
  }
  const limiter = createRateLimiter(2);
  let nextCalls = 0;
  let status = 0;
  let retryAfter = '';
  const req = { socket: { remoteAddress: 'test-client' } } as Request;
  const res = { setHeader: (_name: string, value: string) => { retryAfter = value; },
    status: (value: number) => { status = value; return res; }, json: () => res } as unknown as Response;
  for (let i = 0; i < 3; i++) limiter(req, res, () => { nextCalls++; });
  assert.equal(nextCalls, 2);
  assert.equal(status, 429);
  assert.ok(Number(retryAfter) > 0);
});

test('repository preflight API checks a bounded snapshot and rejects unsafe paths without paid requests', async () => {
  const source = {
    owner: 'fixture', repo: 'app', branch: 'main', commit: 'a'.repeat(40), partial: false, totalFiles: 2,
    observedPaths: ['package.json', 'src/main.ts', 'pnpm-lock.yaml'],
    files: [{ path: 'package.json', content: '{"name":"fixture"}' }, { path: 'src/main.ts', content: 'const wrong: string = 42;' }],
  };
  const before = providerCalls;
  const response = await fetch(base + '/debug/repository-preflight', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(source) });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.commit, source.commit);
  assert.ok(report.findings.syntaxTypes.some((f: { code: string }) => f.code === 'TS2322'));
  assert.match(report.summary, /never guarantees/);
  const unsafe = await fetch(base + '/debug/repository-preflight', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...source, files: [{ path: '../escape.ts', content: '' }] }) });
  assert.equal(unsafe.status, 400);
  assert.ok(!(await unsafe.text()).includes('/home/'));
  assert.equal(providerCalls, before);
});
