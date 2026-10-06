import { exec } from "child_process";
import { promisify } from "util";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { logger } from "./logger";

const execAsync = promisify(exec);

/**
 * Parse a GitHub URL into owner/repo.
 * Accepts:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   owner/repo
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/i, "");

  // owner/repo shorthand
  const shorthand = trimmed.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2] };

  // https://github.com/owner/repo or git@github.com:owner/repo
  const full = trimmed.match(/(?:https?:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/);
  if (full) return { owner: full[1], repo: full[2] };

  return null;
}

export interface CloneResult {
  tempDir: string;
  repoRoot: string;
}

/**
 * Shallow-clone a GitHub repo into a temp directory.
 * If a token is provided, it's embedded in the HTTPS URL so private repos work.
 * The token is never logged.
 */
export async function cloneRepo(
  owner: string,
  repo: string,
  ref: string,
  token?: string,
): Promise<CloneResult> {
  const tempDir = join(
    tmpdir(),
    `mm-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const auth = token ? `x-access-token:${token}@` : "";
  const url = `https://github.com/${owner}/${repo}.git`;
  const cmd = `git clone --depth 1 --branch "${ref.replace(/"/g, "")}" "https://github.com/${owner}/${repo}.git" "${tempDir}"`;

  // Build the actual command with the token embedded only if present
  const cloneCmd = token
    ? `git clone --depth 1 --branch "${ref.replace(/"/g, "")}" "https://x-access-token:${token.replace(/"/g, "")}@github.com/${owner.replace(/"/g, "")}/${repo.replace(/"/g, "")}.git" "${tempDir.replace(/"/g, "")}"`
    : `git clone --depth 1 --branch "${ref.replace(/"/g, "")}" "https://github.com/${owner.replace(/"/g, "")}/${repo.replace(/"/g, "")}.git" "${tempDir.replace(/"/g, "")}"`;

  try {
    await execAsync(cloneCmd, { timeout: 120_000 });
    return { tempDir, repoRoot: tempDir };
  } catch (err: any) {
    // Clean up on failure
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const msg = err?.stderr ?? err?.message ?? "clone failed";
    // Don't leak the token in error messages
    const safeMsg = msg.replace(new RegExp(token?.replace(/[.*+?^${}()|[]\]/g, "\\$&") ?? "", "g"), "<token>");
    logger.error({ owner, repo, ref, err: safeMsg }, "git clone failed");
    throw new Error(`Failed to clone ${owner}/${repo} @ ${ref}: ${safeMsg}`);
  }
}

/** Remove a temp clone directory. Safe to call even if it doesn't exist. */
export async function cleanupClone(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
}
