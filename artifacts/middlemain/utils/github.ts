import { fetch } from 'expo/fetch';

export const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_APP_CLIENT_ID ?? '';
export const GITHUB_INSTALL_URL = process.env.EXPO_PUBLIC_GITHUB_APP_SLUG
  ? `https://github.com/apps/${encodeURIComponent(process.env.EXPO_PUBLIC_GITHUB_APP_SLUG)}/installations/new`
  : 'https://github.com/settings/installations';

export interface RepoFile { path: string; size: number; sha: string }
export interface RepoListing { owner: string; repo: string; branch: string; commit: string; files: RepoFile[]; partial: boolean; totalFiles: number }
export interface DeviceCode { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }

export function parseRepoUrl(value: string): { owner: string; repo: string } {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a full URL such as https://github.com/owner/repository.'); }
  const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || parts.length !== 2 ||
      !parts.every(p => /^[A-Za-z0-9_.-]+$/.test(p) && p !== '.' && p !== '..')) {
    throw new Error('Use the repository’s main HTTPS GitHub URL, without a branch, file path, query, or credentials. Enter the branch separately.');
  }
  const repo = parts[1].replace(/\.git$/, '');
  if (!repo) throw new Error('The repository name cannot be empty.');
  return { owner: parts[0], repo };
}

async function readLimited(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > limit) throw new Error('GitHub response is too large for this source check.');
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > limit) throw new Error('GitHub response is too large for this source check.');
    return text;
  }
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) throw new Error('GitHub response is too large for this source check.');
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
}

async function githubGet(path: string, token: string, signal: AbortSignal, raw = false, limit = 3_000_000): Promise<any> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('Repository or branch not found, or GitHub has not granted access. For a private repo, sign in and install the read-only app on that repository.');
    if (response.status === 401) throw new Error('GitHub authorization expired or was revoked. Disconnect and sign in again.');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub denied access or rate-limited this request. Check repository permissions or try later.');
    throw new Error(`GitHub request failed (${response.status}).`);
  }
  const text = await readLimited(response, limit);
  return raw ? text : JSON.parse(text);
}

export async function listRepo(url: string, branch: string, token: string, signal: AbortSignal): Promise<RepoListing> {
  const { owner, repo } = parseRepoUrl(url);
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const metadata = await githubGet(base, token, signal);
  const ref = branch.trim() || metadata.default_branch;
  const commit = await githubGet(`${base}/commits/${encodeURIComponent(ref)}`, token, signal);
  const tree = await githubGet(`${base}/git/trees/${encodeURIComponent(commit.commit.tree.sha)}?recursive=1`, token, signal);
  const allowed = (tree.tree ?? []).filter((f: any) => f.type === 'blob' && /\.(?:tsx?|jsx?|json)$/i.test(f.path) &&
    !/(^|\/)(node_modules|dist|build|\.expo|vendor|coverage|\.git)(\/|$)/.test(f.path) &&
    !/(credential|secret|private[-_]?key|service[-_]?account|package-lock|tsconfig\.tsbuildinfo)/i.test(f.path) &&
    f.size <= 150_000 && typeof f.sha === 'string');
  return { owner, repo, branch: ref, commit: commit.sha, files: allowed.slice(0, 300), totalFiles: allowed.length, partial: !!tree.truncated || allowed.length > 300 };
}

export async function loadRepoFile(list: RepoListing, file: RepoFile, token: string, signal: AbortSignal): Promise<string> {
  if (!list.files.some(f => f.path === file.path && f.sha === file.sha)) throw new Error('Choose a file from the loaded repository.');
  const path = file.path.split('/').map(encodeURIComponent).join('/');
  return githubGet(`/repos/${encodeURIComponent(list.owner)}/${encodeURIComponent(list.repo)}/contents/${path}?ref=${encodeURIComponent(list.commit)}`, token, signal, true, 150_000);
}

async function githubDevice(path: string, body: Record<string, string>, signal: AbortSignal): Promise<any> {
  const response = await fetch(`https://github.com/login/${path}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error(`GitHub sign-in failed (${response.status}).`);
  return response.json();
}

export async function beginGitHubSignIn(signal: AbortSignal): Promise<DeviceCode> {
  if (!GITHUB_CLIENT_ID) throw new Error('Private-repo sign-in is not configured in this build. The app owner must register a read-only GitHub App and configure its public client ID.');
  const code = await githubDevice('device/code', { client_id: GITHUB_CLIENT_ID }, signal);
  if (code.error || !code.device_code || !code.user_code) throw new Error(code.error_description || 'GitHub device sign-in must be enabled by the app owner.');
  return code;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('GitHub sign-in cancelled.')); return; }
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new Error('GitHub sign-in cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/** GitHub App device flow: no client secret and no owner token. Tokens stay in session memory. */
export async function completeGitHubSignIn(code: DeviceCode, signal: AbortSignal): Promise<{ token: string; expiresAt: number }> {
  let interval = Math.max(code.interval || 5, 5);
  const deadline = Date.now() + Math.min(code.expires_in || 900, 900) * 1000;
  while (Date.now() < deadline) {
    await wait(interval * 1000, signal);
    if (Date.now() >= deadline) break;
    const result = await githubDevice('oauth/access_token', { client_id: GITHUB_CLIENT_ID, device_code: code.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, signal);
    if (result.access_token) {
      if (!result.access_token.startsWith('ghu_')) throw new Error('Only customer-scoped GitHub App authorization is supported.');
      return { token: result.access_token, expiresAt: Date.now() + Math.min(result.expires_in || 28800, 28800) * 1000 };
    }
    if (result.error === 'slow_down') { interval = Math.max(interval + 5, result.interval || 0); continue; }
    if (result.error === 'authorization_pending') continue;
    throw new Error(result.error_description || 'GitHub sign-in was denied or expired. Start again when ready.');
  }
  throw new Error('GitHub sign-in expired. Start again when ready.');
}
