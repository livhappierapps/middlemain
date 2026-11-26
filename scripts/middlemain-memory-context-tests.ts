import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Memory Machine pre-call hook on /api/grok/chat: injects, forwards the user's
// Clerk token, and never blocks or breaks chat when Memory Machine misbehaves.
const key = randomUUID();
const testDir = mkdtempSync(join(tmpdir(), 'middlemain-memory-tests-'));
process.env.MIDDLEMAIN_ROOM_STORE_PATH = join(testDir, 'rooms.json');
process.env.LEO_EXECUTIVE_KEY = key;
process.env.XAI_API_KEY = randomUUID();
process.env.NODE_ENV = 'test';
delete process.env.MEMORY_MACHINE_URL;
delete process.env.MEMORY_MACHINE_SERVICE_KEY;

const MM = 'https://mm.test';
type Mode = 'ok' | 'hang' | 'error';
let mode: Mode = 'ok';
let xaiBodies: any[] = [];
let mmRequests: { path: string; auth: string | null; svc: string | null; method: string }[] = [];
let storedProfile: any = null;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.origin === 'https://api.x.ai') {
    const body = JSON.parse(String(init?.body));
    xaiBodies.push(body);
    const content = body.model === 'grok-4.3' ? 'PROFILE: likes neon' : 'mock response';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });
  }
  if (url.origin === MM) {
    const h = new Headers(init?.headers);
    mmRequests.push({ path: url.pathname + url.search, auth: h.get('authorization'), svc: h.get('x-mm-service-key'), method: init?.method ?? 'GET' });
    if (mode === 'hang') return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    if (mode === 'error') return new Response('{"error":"internal"}', { status: 500 });
    if (url.pathname === '/healthz') return Response.json({ ok: true });
    if (url.pathname === '/v1/profile' && (init?.method ?? 'GET') === 'PUT') {
      storedProfile = JSON.parse(String(init.body));
      return Response.json(storedProfile);
    }
    if (url.pathname === '/v1/profile') return storedProfile ? Response.json(storedProfile) : new Response('{}', { status: 404 });
    if (url.pathname === '/v1/memories') {
      return Response.json({ items: [
        { id: '1', kind: 'note', title: 'Court hearing', body: 'moved to Friday 9am', occurredAt: null, createdAt: new Date().toISOString() },
      ] });
    }
    return new Response('{}', { status: 404 });
  }
  return originalFetch(input, init);
};

const { default: app } = await import('../artifacts/api-server/src/app');
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;
const owner = { 'content-type': 'application/json', 'x-executive-key': key };
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  rmSync(testDir, { recursive: true, force: true });
});
beforeEach(() => { mode = 'ok'; xaiBodies = []; mmRequests = []; });

const configure = (body: unknown) => fetch(base + '/memory/config', { method: 'POST', headers: owner, body: JSON.stringify(body) });
const chat = (extra: Record<string, string> = {}) => fetch(base + '/grok/chat', {
  method: 'POST', headers: { ...owner, ...extra },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'When is my court hearing?' }], stream: false, systemPrompt: 'BASE PROMPT' }),
});

test('memory routes are owner-only and reject non-https URLs', async () => {
  for (const path of ['/memory/config', '/memory/profile/rebuild', '/memory/status']) {
    const r = await fetch(base + path, { method: path.endsWith('status') ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: path.endsWith('status') ? undefined : '{}' });
    assert.equal(r.status, 401, path);
  }
  assert.equal((await configure({ url: 'http://evil.example' })).status, 400);
  assert.equal((await configure({ url: 'https://user:pw@mm.test' })).status, 400);
});

test('without Memory Machine config the prompt is untouched and Memory Machine is never called', async () => {
  await configure({ url: null, serviceKey: null });
  const r = await chat();
  assert.equal(r.status, 200);
  assert.equal(xaiBodies[0].messages[0].content, 'BASE PROMPT');
  assert.equal(mmRequests.length, 0);
});

test('injects profile + relevant memories, forwarding the Clerk token as Bearer', async () => {
  storedProfile = { body: 'Prefers short answers.', metadata: { builtAt: new Date().toISOString() } };
  const status = await (await configure({ url: MM + '/', serviceKey: 'svc-key' })).json();
  assert.deepEqual(status, { configured: true, hasServiceKey: true, injection: true });
  const r = await chat({ 'x-memory-token': 'aaa.bbb.ccc' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-memory-context'), 'profile=1;memories=1');
  const sys = xaiBodies[0].messages[0].content as string;
  assert.ok(sys.startsWith('BASE PROMPT'));
  assert.match(sys, /About the user[\s\S]*Prefers short answers/);
  assert.match(sys, /Relevant memories[\s\S]*\[note\] Court hearing/);
  const search = mmRequests.find(m => m.path.startsWith('/v1/memories'))!;
  assert.match(search.path, /match=any/);
  assert.match(search.path, /limit=25/);
  assert.equal(search.auth, 'Bearer aaa.bbb.ccc');
  assert.equal(search.svc, null);
});

test('falls back to the service key when the app sent no token', async () => {
  await configure({ url: MM, serviceKey: 'svc-key' });
  await chat();
  assert.ok(mmRequests.every(m => m.svc === 'svc-key' && m.auth === null));
});

test('Memory Machine down or hanging never blocks or breaks chat', async () => {
  await configure({ url: MM, serviceKey: 'svc-key' });
  mode = 'error';
  const r1 = await chat();
  assert.equal(r1.status, 200);
  assert.equal(xaiBodies.at(-1).messages[0].content, 'BASE PROMPT');
  mode = 'hang';
  await configure({ url: MM, serviceKey: 'svc-key' }); // clears profile cache
  const t0 = Date.now();
  const r2 = await chat();
  const elapsed = Date.now() - t0;
  assert.equal(r2.status, 200);
  assert.ok(elapsed < 2500, `chat took ${elapsed}ms`);
  assert.equal(xaiBodies.at(-1).messages[0].content, 'BASE PROMPT');
});

test('profile rebuild uses the cheap model, stores via PUT /v1/profile', async () => {
  storedProfile = null;
  await configure({ url: MM, serviceKey: 'svc-key' });
  const r = await fetch(base + '/memory/profile/rebuild', { method: 'POST', headers: owner, body: '{}' });
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.status, 'rebuilt');
  assert.equal(xaiBodies.length, 1);
  assert.equal(xaiBodies[0].model, 'grok-4.3');
  assert.equal(storedProfile.body, 'PROFILE: likes neon');
  assert.ok(mmRequests.some(m => m.method === 'PUT' && m.svc === 'svc-key'));
});
