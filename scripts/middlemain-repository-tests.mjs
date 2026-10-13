import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
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
    .replace("process.env.EXPO_PUBLIC_GITHUB_APP_CLIENT_ID ?? ''", "'public-test-client-id'")
    .replace('process.env.EXPO_PUBLIC_DOMAIN', "'source.mock.test'");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const path = join(temp, `${name}.mjs`);
  await writeFile(path, output);
  return import(pathToFileURL(path).href);
}
const github = await load('github');
const ai = await load('debugAI');
async function loadPreflight() {
  const workerSource = await readFile(new URL('../artifacts/api-server/src/lib/repositoryPreflightWorker.ts', import.meta.url), 'utf8');
  const libraryUrl = new URL('../artifacts/api-server/src/lib/repositoryPreflight.ts', import.meta.url);
  const librarySource = (await readFile(libraryUrl, 'utf8'))
    .replace('createRequire(import.meta.url)', `createRequire(${JSON.stringify(libraryUrl.href)})`)
    .replace('"./repositoryPreflightWorker"', '"./repositoryPreflightWorker.mjs"');
  for (const [name, source] of [['repositoryPreflightWorker', workerSource], ['repositoryPreflight', librarySource]]) {
    await writeFile(join(temp, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  }
  return import(pathToFileURL(join(temp, 'repositoryPreflight.mjs')).href);
}
const preflight = await loadPreflight();
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
      { type: 'blob', mode: '120000', path: 'src/link.ts', size: 10, sha: 'skip' },
      { type: 'blob', path: '../escape.ts', size: 10, sha: 'skip' },
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

const snapshot = (files, extra = {}) => ({
  owner: 'example', repo: 'project', branch: 'feature/test', commit: 'a'.repeat(40),
  files, observedPaths: [...files.map(f => f.path), 'pnpm-lock.yaml'],
  totalFiles: files.length, partial: false, ...extra,
});
const manifest = { path: 'package.json', content: '{"name":"fixture","dependencies":{"declared-library":"1.0.0"}}' };

test('repository snapshot retrieval is commit-pinned, concurrency-bounded, and reports omitted/failed files', async () => {
  let active = 0, peak = 0;
  globalThis.fetch = async (url) => {
    assert.ok(url.endsWith('?ref=' + 'a'.repeat(40)));
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active--;
    return url.includes('f1.ts?') ? new Response('', { status: 404 }) : new Response('export const value = 1;');
  };
  const files = Array.from({ length: 61 }, (_, i) => ({ path: `src/f${i}.ts`, size: 25, sha: `blob${i}` }));
  const list = { owner: 'example', repo: 'project', branch: 'main', commit: 'a'.repeat(40), files, totalFiles: 61, partial: false };
  const result = await github.loadRepoSnapshot(list, 'mock-customer-token', new AbortController().signal);
  assert.equal(result.partial, true);
  assert.equal(result.files.length, 59);
  assert.ok(peak <= 3);
  assert.equal(Object.hasOwn(result, 'token'), false);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(github.loadRepoSnapshot(list, '', abort.signal), /cancelled|timed out/);
});

test('preflight rejects traversal, duplicate paths, credential paths, and source/file/UTF-8 limits', () => {
  for (const path of ['../escape.ts', '/etc/passwd.ts', 'src\\escape.ts', 'src/./file.ts', 'src//file.ts', '.env.json', 'node_modules/run.js']) {
    assert.throws(() => preflight.validateRepositorySnapshot(snapshot([{ path, content: '' }])), /Unsafe/);
  }
  assert.throws(() => preflight.validateRepositorySnapshot(snapshot([
    { path: 'same.ts', content: '' }, { path: 'same.ts', content: '' },
  ])), /duplicate/);
  assert.throws(() => preflight.validateRepositorySnapshot(snapshot([{ path: 'large.ts', content: '😅'.repeat(40000) }])), /byte limits/);
  assert.throws(() => preflight.validateRepositorySnapshot(snapshot(Array.from({ length: 61 }, (_, i) => ({ path: `${i}.ts`, content: '' })))), /file count/);
  assert.throws(() => preflight.validateRepositorySnapshot(snapshot([
    { path: 'a.ts', content: 'a'.repeat(140000) }, { path: 'b.ts', content: 'b'.repeat(140000) },
  ])), /byte limits/);
  assert.equal(preflight.activeRepositoryChecks(), 0);
});

test('repository virtual compiler resolves supplied files and reports actual type/syntax errors separately', async () => {
  const result = await preflight.runRepositoryPreflight(snapshot([
    manifest,
    { path: 'src/value.ts', content: 'export const value = 42;' },
    { path: 'src/main.ts', content: 'import { value } from "./value"; const text: string = value;' },
    { path: 'src/broken.ts', content: 'const broken = ;' },
  ]));
  assert.equal(result.partial, false);
  assert.equal(result.status, 'FINDINGS');
  assert.ok(result.findings.syntaxTypes.some(f => f.code === 'TS2322' && f.path === 'src/main.ts'));
  assert.ok(result.findings.syntaxTypes.some(f => f.path === 'src/broken.ts'));
  assert.ok(!result.findings.dependencies.some(f => f.message.includes('./value')));
  assert.equal(result.commit, 'a'.repeat(40));
  assert.equal(result.branch, 'feature/test');
  assert.ok(result.findings.native.some(f => /not run/i.test(f.message)));
  assert.match(result.summary, /never guarantees/);
});

test('repository scripts, plugins and imports cannot execute or read server files', async () => {
  const marker = join(temp, 'untrusted-code-executed');
  const privateSource = join(temp, 'server-private.ts');
  await writeFile(privateSource, 'export const privateValue: string = "server-private-fixture";');
  const result = await preflight.runRepositoryPreflight(snapshot([
    { path: 'package.json', content: JSON.stringify({ name: 'fixture', scripts: { preinstall: `touch ${marker}` } }) },
    { path: 'tsconfig.json', content: JSON.stringify({ extends: privateSource, compilerOptions: { plugins: [{ name: privateSource }] } }) },
    { path: 'app.config.js', content: `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe');` },
    { path: 'src/main.ts', content: `import {privateValue} from ${JSON.stringify(privateSource)}; export const x = privateValue;` },
  ]));
  await assert.rejects(access(marker));
  assert.ok(result.findings.configuration.some(f => f.code === 'CONFIG_NOT_EXECUTED'));
  assert.ok(result.findings.dependencies.some(f => f.message.includes('could not be resolved')));
  assert.ok(!JSON.stringify(result).includes('server-private-fixture'));
  assert.equal(preflight.activeRepositoryChecks(), 0);
});

test('declared missing package types are inconclusive; undeclared imports and malformed config remain findings', async () => {
  const result = await preflight.runRepositoryPreflight(snapshot([
    manifest,
    { path: 'src/main.ts', content: 'import {x} from "declared-library"; import {y} from "undeclared-library"; export {x,y};' },
    { path: 'app.json', content: '{broken' },
  ]));
  assert.equal(result.findings.dependencies.find(f => f.message.startsWith('declared-library')).severity, 'warning');
  assert.equal(result.findings.dependencies.find(f => f.message.startsWith('undeclared-library')).severity, 'error');
  assert.ok(result.findings.configuration.some(f => f.code === 'JSON_SYNTAX'));
  const partial = await preflight.runRepositoryPreflight(snapshot([manifest, { path: 'main.ts', content: 'import "./omitted";' }], { partial: true, totalFiles: 3 }));
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(partial.findings.dependencies[0].severity, 'warning');
  const aliased = await preflight.runRepositoryPreflight(snapshot([
    manifest,
    { path: 'tsconfig.json', content: '{"compilerOptions":{"paths":{"~/*":["src/*"]}}}' },
    { path: 'main.ts', content: 'import {x} from "~/omitted"; export {x};' },
  ]));
  assert.equal(aliased.findings.dependencies[0].severity, 'warning');
  assert.ok(aliased.findings.configuration.some(f => f.code === 'ALIASES_UNVERIFIED'));
});

test('timeout preserves partial progress, terminates workers, and releases bounded concurrency slots', async () => {
  let terminated = 0;
  const workerFactory = (code, options) => {
    assert.ok(!code.includes('untrusted-snapshot-sentinel'));
    assert.equal(options.resourceLimits.maxOldGenerationSizeMb, 128);
    assert.equal(options.resourceLimits.stackSizeMb, 4);
    const worker = new EventEmitter();
    worker.terminate = async () => { terminated++; return 0; };
    const progress = options.workerData.report;
    progress.findings.configuration.push({ code: 'PROGRESS', severity: 'warning', message: 'Configuration checked before timeout.' });
    setImmediate(() => worker.emit('message', { progress }));
    return worker;
  };
  const data = snapshot([{ path: 'main.ts', content: '// untrusted-snapshot-sentinel' }]);
  const options = { timeoutMs: 25, workerFactory };
  const first = preflight.runRepositoryPreflight(data, options);
  const second = preflight.runRepositoryPreflight(data, options);
  await assert.rejects(preflight.runRepositoryPreflight(data, options), /already running/);
  const results = await Promise.all([first, second]);
  assert.equal(terminated, 2);
  assert.equal(preflight.activeRepositoryChecks(), 0);
  for (const result of results) {
    assert.equal(result.status, 'PARTIAL');
    assert.ok(result.findings.configuration.some(f => f.code === 'PROGRESS'));
    assert.ok(result.findings.configuration.some(f => f.code === 'CHECK_INCOMPLETE'));
  }
});

test('cancellation and worker failure return partial reports and reclaim resources', async () => {
  let terminated = 0;
  const data = snapshot([{ path: 'main.ts', content: 'const x = 1;' }]);
  const controller = new AbortController();
  const makeWorker = () => {
    const worker = new EventEmitter();
    worker.terminate = async () => { terminated++; return 0; };
    return worker;
  };
  const cancelled = preflight.runRepositoryPreflight(data, { signal: controller.signal, workerFactory: makeWorker });
  controller.abort();
  assert.equal((await cancelled).status, 'PARTIAL');
  await assert.rejects(preflight.runRepositoryPreflight(data, { signal: controller.signal }), /cancelled/);
  const result = await preflight.runRepositoryPreflight(data, { workerFactory: () => {
    const worker = makeWorker();
    setImmediate(() => worker.emit('error', new Error('secret-server-path-must-not-leak')));
    return worker;
  } });
  assert.equal(result.status, 'PARTIAL');
  assert.ok(!JSON.stringify(result).includes('secret-server-path-must-not-leak'));
  assert.equal(terminated, 2);
  assert.equal(preflight.activeRepositoryChecks(), 0);
});

test('preflight upload contains no GitHub credential and rejects mismatched API reports without retrying', async () => {
  const input = snapshot([{ path: 'main.ts', content: 'const x = 1;' }]);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://source.mock.test/api/debug/repository-preflight');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), input);
    return json({ ...input, status: 'PARTIAL', summary: 'Static check only.', coverage: {}, findings: { syntaxTypes: [], dependencies: [], configuration: [], native: [] } });
  };
  assert.equal((await github.requestRepoPreflight({ ...input, token: 'mock-session-credential-never-upload' }, new AbortController().signal)).status, 'PARTIAL');
  globalThis.fetch = async () => { calls++; return json({ commit: 'wrong-commit' }); };
  await assert.rejects(github.requestRepoPreflight(input, new AbortController().signal), /mismatched/);
  assert.equal(calls, 2);
});

test('bounded diagnostic output is visibly partial rather than a complete pass', async () => {
  const result = await preflight.runRepositoryPreflight(snapshot([
    manifest, { path: 'main.ts', content: Array.from({ length: 150 }, (_, i) => `const broken${i} = ;`).join('\n') },
  ]));
  assert.equal(result.partial, true);
  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.findings.configuration.some(f => f.code === 'OUTPUT_LIMIT'));
  assert.ok(Object.values(result.findings).flat().length <= 121);
  assert.equal(preflight.activeRepositoryChecks(), 0);
});
