import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp = await mkdtemp(join(tmpdir(), 'memory-transport-'));
const target = join(temp, 'transport.mjs');
await writeFile(target, ts.transpileModule(
  await readFile(new URL('../artifacts/middlemain/utils/memoryTransport.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText);
const { createMemoryTransport } = await import(pathToFileURL(target).href);
after(() => rm(temp, { recursive: true, force: true }));
const response = (id, result, headers = {}) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
  headers: { 'Content-Type': 'application/json', ...headers },
});

test('initializes, preserves session header, and accepts SSE tool results', async () => {
  const methods = [];
  const client = createMemoryTransport('https://memory.example/api/mcp', 'test-only', async (_, init) => {
    const body = JSON.parse(init.body);
    methods.push(body.method);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Accept, 'application/json, text/event-stream');
    if (body.method === 'initialize') return response(body.id, { protocolVersion: '2025-06-18' }, { 'Mcp-Session-Id': 'session-test' });
    assert.equal(init.headers['Mcp-Session-Id'], 'session-test');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [] } })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } });
  });
  assert.deepEqual(await client.call('tools/list'), { tools: [] });
  assert.deepEqual(methods, ['initialize', 'notifications/initialized', 'tools/list']);
});
test('legacy fallback is only for Method Not Found', async () => {
  let calls = 0;
  const client = createMemoryTransport('https://memory.example/api/mcp', 'test-only', async (_, init) => {
    calls++;
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return new Response(JSON.stringify({ id: body.id, error: { code: -32601 } }));
    return response(body.id, { tools: [] });
  });
  assert.deepEqual(await client.call('tools/list'), { tools: [] });
  assert.equal(calls, 2);
});
test('authentication failures stop without fallback or secret disclosure', async () => {
  let calls = 0;
  const client = createMemoryTransport('https://memory.example/api/mcp', 'secret-test', async () => {
    calls++; return new Response('secret-test', { status: 401 });
  });
  await assert.rejects(client.call('tools/list'), error => /HTTP 401/.test(error.message) && !error.message.includes('secret-test'));
  assert.equal(calls, 1);
});
test('failed tool writes are not reported as success or replayed', async () => {
  let writes = 0;
  const client = createMemoryTransport('https://memory.example/api/mcp', 'test-only', async (_, init) => {
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') return response(body.id, { protocolVersion: '2025-06-18' });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    writes++; return response(body.id, { isError: true, content: [{ text: 'private error' }] });
  });
  await assert.rejects(client.call('tools/call'), /tool reported failure/);
  assert.equal(writes, 1);
});
test('insecure endpoints and embedded passwords are rejected', () => {
  assert.throws(() => createMemoryTransport('http://memory.example', 'test'));
  assert.throws(() => createMemoryTransport('https://user:password@memory.example', 'test'));
});
