/**
 * GitHub authentication helpers for the debug/repo route.
 *
 * Private repos are cloned via HTTPS with a token embedded in the URL.
 * Tokens are never logged or returned to clients.
 */

/**
 * Parse a GitHub URL into owner/repo.
 * Accepts: https://github.com/owner/repo, github.com/owner/repo,
 * owner/repo, or a .git URL. Strips trailing .git and any path after repo.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/i, "");

  // Full URL: https://github.com/owner/repo or http://github.com/owner/repo
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Shorthand: owner/repo
  const shortMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

/**
 * Build an authenticated clone URL.
 * If GITHUB_TOKEN is set, embed it so private repos can be cloned.
 * Format: https://x-access-token:<token>@github.com/owner/repo.git
 */
export function buildCloneUrl(owner: string, repo: string): string {
  const token = process.env.GH_TOKEN ?? process.env.GH_PAT ?? process.env.GH_ACCESS_TOKEN;
  if (token) {
    return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  }
  return `https://github.com/${owner}/${repo}.git`;
}

/**
 * Whether a server-side GitHub token is configured.
 * Used to tell the client whether private repos are supported.
 */
export function isGitHubTokenConfigured(): boolean {
  return !!(process.env.GH_TOKEN ?? process.env.GH_PAT ?? process.env.GH_ACCESS_TOKEN);\n}
