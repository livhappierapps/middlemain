import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Transpile the actual native utility modules with a fetch seam. All requests are mocked.
const temp = await mkdtemp(join(tmpdir(), 'middlemain-repo-tests-'));
const originalFetch = globalThis.fetch;
async function load(name) {
  const source = (await readFile(new URL(`../artifacts/middlemain/utils/${name}.ts`, import.meta.url), 'utf8'))
    .replace("import { fetch } from 'expo/fetch';", 'const fetch = (...args) => globalThis.fetch(...args);')
    .replace("process.env.EXPO_PUBLIC_GITHUB_APP_CLIENT_ID ?? ''", "'public-test-client-id'");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const path = join(temp, `${name}.mjs`);
  await writeFile(path, output);
  return import(pathToFileURL(path).href);
}
const github = await load('github');
const ai = await load('debugAI');
after(async () => { globalThis.fetch = originalFetch; await rm(temp, { recursive: true, force: true }); });
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const conn = { id: 'test', provider: 'openai', apiKey: 'mock-customer-key', model: 'test-model', name: 'Test connection', systemPrompt: '', isActive: true };

test('repository URL accepts only the GitHub repository root without credentials', () => {
  assert.deepEqual(github.parseRepoUrl('https://github.com/example/project.git/'), { owner: 'example', repo: 'project' });
  for (const url of ['http://github.com/a/b', 'https://github.com.evil.test/a/b', 'https://user:pass@github.com/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b?token=abc', 'https://github.com/a/.git', 'https://localhost/a/b']) {
    assert.throws(() => github.parseRepoUrl(url));
  }
});

test('listing filters secret/large/generated files and pins the selected branch to a commit', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/repos/example/project')) return json({ default_branch: 'main' });
    if (url.includes('/commits/')) return json({ sha: 'pinned-commit', commit: { tree: { sha: 'tree-sha' } } });
    if (url.includes('/git/trees/')) return json({ truncated: false, tree: [
      { type: 'blob', path: 'src/index.ts', size: 40, sha: 'blob-sha' },
      { type: 'blob', path: 'package.json', size: 80, sha: 'package-sha' },
      { type: 'blob', path: 'node_modules/library.ts', size: 10, sha: 'skip' },
      { type: 'blob', path: 'credentials.json', size: 10, sha: 'skip' },
      { type: 'blob', path: 'huge.ts', size: 150001, sha: 'skip' },
    ] });
    throw new Error(`Unexpected mocked URL: ${url}`);
  };
  const result = await github.listRepo('https://github.com/example/project', 'feature/test', 'mock-user-token', new AbortController().signal);
  assert.deepEqual(result.files.map(f => f.path), ['src/index.ts', 'package.json']);
  assert.equal(result.commit, 'pinned-commit');
  assert.ok(calls[1].url.includes('feature%2Ftest'));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer mock-user-token');
  globalThis.fetch = async (url) => { assert.ok(url.endsWith('?ref=pinned-commit')); return new Response('const answer = 42;'); };
  assert.equal(await github.loadRepoFile(result, result.files[0], '', new AbortController().signal), 'const answer = 42;');
  await assert.rejects(github.loadRepoFile(result, { path: '../../other', sha: 'unknown' }, '', new AbortController().signal), /Choose a file/);
});

test('oversized GitHub responses and denied private access fail explicitly', async () => {
  globalThis.fetch = async () => new Response('{}', { headers: { 'Content-Length': '4000000' } });
  await assert.rejects(github.listRepo('https://github.com/example/project', '', '', new AbortController().signal), /too large/);
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(github.listRepo('https://github.com/example/project', '', '', new AbortController().signal), /private repo/);
  globalThis.fetch = async () => new Response('', { status: 401 });
  await assert.rejects(github.listRepo('https://github.com/example/project', '', 'mock-token', new AbortController().signal), /expired or was revoked/);
});

test('GitHub device flow requests no broad OAuth scope or client secret', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://github.com/login/device/code');
    assert.deepEqual(JSON.parse(options.body), { client_id: 'public-test-client-id' });
    return json({ device_code: 'mock-device-code', user_code: 'MOCK-CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 });
  };
  const code = await github.beginGitHubSignIn(new AbortController().signal);
  assert.equal(code.user_code, 'MOCK-CODE');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(github.completeGitHubSignIn(code, abort.signal), /cancelled/);
});

test('device token belongs to a GitHub App customer session and has bounded expiry', async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    assert.equal(JSON.parse(options.body).grant_type, 'urn:ietf:params:oauth:grant-type:device_code');
    return json({ access_token: 'ghu_mock_fixture_only', expires_in: 28800, refresh_token: 'not-stored' });
  };
  const auth = await github.completeGitHubSignIn({ device_code: 'mock', expires_in: 900, interval: 5 }, new AbortController().signal);
  assert.equal(calls, 1);
  assert.ok(auth.expiresAt <= Date.now() + 28800000);
  assert.equal(Object.hasOwn(auth, 'refresh_token'), false);
});

test('source analysis cannot bill the owner server and does not automatically retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('mock unavailable'); };
  await assert.rejects(ai.analyzeCode({ ...conn, provider: 'server' }, 'const x = 1;', 'prompt', new AbortController().signal), /owner/);
  assert.equal(calls, 0);
  await assert.rejects(ai.analyzeCode(conn, 'const x = 1;', 'prompt', new AbortController().signal), /mock unavailable/);
  assert.equal(calls, 1);
});

test('OpenAI analysis is one bounded request using the customer connection', async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer mock-customer-key');
    const body = JSON.parse(options.body);
    assert.equal(body.max_output_tokens, 2048);
    assert.equal(body.store, false);
    assert.equal(body.instructions, 'Review safely');
    return json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Mock analysis' }] }] });
  };
  assert.equal(await ai.analyzeCode(conn, 'const x = 1;', 'Review safely', new AbortController().signal), 'Mock analysis');
  assert.equal(calls, 1);
});

test('Anthropic analysis uses native messages, system prompt, and a bounded result', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    const body = JSON.parse(options.body);
    assert.equal(body.system, 'Review safely');
    assert.equal(body.max_tokens, 2048);
    return json({ content: [{ type: 'text', text: 'Mock analysis' }], stop_reason: 'max_tokens' });
  };
  assert.match(await ai.analyzeCode({ ...conn, provider: 'anthropic' }, '{}', 'Review safely', new AbortController().signal), /incomplete/);
});
