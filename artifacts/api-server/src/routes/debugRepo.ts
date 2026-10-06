import { Router, type Request, type Response } from "express";
import { exec } from "child_process";
import { writeFile, rm, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { logger } from "../lib/logger";
import {
  parseGitHubUrl,
  buildCloneUrl,
  isGitHubTokenConfigured,
} from "../lib/githubAuth";

const execAsync = promisify(exec);
const debugRepoRouter = Router();

// Reuse the same compiler setup as the pasted-code debug route
const TSC_BIN = "/home/runner/workspace/node_modules/.bin/tsc";
const TYPE_ROOTS = "/home/runner/workspace/artifacts/middlemain/node_modules/@types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiagnosticEntry {
  line: number;
  col: number;
  code: string;
  message: string;
  severity: "error" | "warning";
  file: string;
}

interface RepoCheckResult {
  pass: boolean;
  verdict: "CLEAN" | "ERRORS" | "WARNINGS_ONLY" | "NO_TYPESCRIPT";
  errors: DiagnosticEntry[];
  summary: string;
  rawOutput: string;
  durationMs: number;
  repo: { owner: string; repo: string; ref: string };
  filesChecked: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTscOutput(raw: string, repoDir: string): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  // tsc format: /path/to/file(line,col): error|warning TSxxxx: message
  const escaped = repoDir.replace(/[.*+?^${}()|[]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}\\/(.+?)\\((\\d+),(\\d+)\\):\\s+(error|warning)\\s+TS(\\d+):\\s+(.+)`,
  );
  for (const line of raw.split("\n")) {
    const m = line.trim().match(re);
    if (m) {
      out.push({
        file: m[1],
        line: parseInt(m[2], 10),
        col: parseInt(m[3], 10),
        severity: m[4] as "error" | "warning",
        code: `TS${m[5]}`,
        message: m[6].trim(),
      });
    }
  }
  return out;
}

function buildSummary(errors: DiagnosticEntry[]): string {
  const errCount = errors.filter((e) => e.severity === "error").length;
  const warnCount = errors.filter((e) => e.severity === "warning").length;
  if (errCount === 0 && warnCount === 0) return "No issues found — safe to build.";
  const parts: string[] = [];
  if (errCount > 0) parts.push(`${errCount} error${errCount > 1 ? "s" : ""}`);
  if (warnCount > 0) parts.push(`${warnCount} warning${warnCount > 1 ? "s" : ""}`);
  return parts.join(", ") + (errCount > 0 ? " — build will fail." : " — build may succeed.");
}

async function countTsFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countTsFiles(full);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      count++;
    }
  }
  return count;
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/debug/repo
 * Body: { url: string, ref?: string, mode?: "expo" | "typescript" | "javascript" | "general" }
 *
 * Clones a GitHub repo (public or private via GH_TOKEN) and typechecks it
 * with the real TypeScript compiler, using the middlemain project's @types.
 * Returns structured diagnostics + a build verdict, same shape as /api/debug/typecheck.
 */
debugRepoRouter.post("/debug/repo", async (req: Request, res: Response) => {
  const { url, ref = "HEAD", mode = "expo" } = req.body as {
    url?: string;
    ref?: string;
    mode?: string;
  };

  if (!url || typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "No repository URL provided" });
    return;
  }

  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    res.status(400).json({ error: "Invalid GitHub URL — expected github.com/owner/repo" });
    return;
  }

  // Private repos need a server-side token
  if (!isGitHubTokenConfigured()) {
    // We can't know for sure it's private, but warn the client
    logger.warn(
      { owner: parsed.owner, repo: parsed.repo },
      "No GH_TOKEN configured — private repos will fail to clone",
    );
  }

  const cloneUrl = buildCloneUrl(parsed.owner, parsed.repo);
  const tempDir = join(tmpdir(), `mm-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`, "repo");
  const start = Date.now();

  try {
    await mkdir(tempDir, { recursive: true });

    // Shallow clone — depth 1 is enough for typechecking
    const cloneCmd = `git clone --depth 1 ${ref !== "HEAD" ? `--branch "${ref.replace(/"/g, "")}" ` : ""}${cloneUrl} "${tempDir}"`;
    try {
      await execAsync(cloneCmd, { timeout: 120_000 });
    } catch (err: any) {
      const msg = (err.stderr ?? err.message ?? "").toString();
      if (/Repository not found|Authentication failed|403|404/.test(msg)) {
        res.status(404).json({
          error: "Repository not found or not accessible — check the URL and that GH_TOKEN can read it if it's private",
        });
        return;
      }
      throw err;
    }

    const fileCount = await countTsFiles(tempDir);
    if (fileCount === 0) {
      const result: RepoCheckResult = {
        pass: true,
        verdict: "NO_TYPESCRIPT",
        errors: [],
        summary: "No TypeScript or JavaScript files found in the repository.",
        rawOutput: "",
        durationMs: Date.now() - start,
        repo: { owner: parsed.owner, repo: parsed.repo, ref },
        filesChecked: 0,
      };
      res.json(result);
      return;
    }

    const isJS = mode === "javascript";
    const jsxMode = isJS || mode === "general" ? "react" : "react-native";

    const flags = [
      "--noEmit",
      "--allowJs",
      `--jsx ${jsxMode}`,
      "--esModuleInterop",
      "--allowSyntheticDefaultImports",
      "--skipLibCheck",
      "--target ES2020",
      "--lib ES2020,DOM",
      "--moduleResolution node",
      `--typeRoots "${TYPE_ROOTS}"`,
      "--strict false",
      "--noImplicitAny false",
      "--noUnusedLocals false",
      "--noUnusedParameters false",
    ].join(" ");

    // Typecheck the whole repo root
    const cmd = `"${TSC_BIN}" ${flags} --project "${tempDir}" 2>&1 || "${TSC_BIN}" ${flags} "${tempDir}"/**/*.{ts,tsx,js,jsx}"`;
    let rawOutput = "";

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 120_000 });
      rawOutput = (stdout + stderr).trim();
    } catch (err: any) {
      // tsc exits non-zero when errors found — that's expected
      rawOutput = ((err.stdout ?? "") + (err.stderr ?? "")).trim();
    }

    const errors = parseTscOutput(rawOutput, tempDir);
    const hasErrors = errors.some((e) => e.severity === "error");
    const hasWarnings = errors.some((e) => e.severity === "warning");

    const verdict: RepoCheckResult["verdict"] = hasErrors
      ? "ERRORS"
      : hasWarnings
      ? "WARNINGS_ONLY"
      : "CLEAN";

    // Scrub the temp path so only relative file paths show
    const scrubbed = rawOutput
      .replace(new RegExp(tempDir.replace(/[.*+?^${}()|[]\\]/g, "\\$&"), "g"), "")
      .replace(/\/tmp\/mm-repo-[^\s]+/g, "");

    const result: RepoCheckResult = {
      pass: !hasErrors,
      verdict,
      errors,
      summary: buildSummary(errors),
      rawOutput: scrubbed,
      durationMs: Date.now() - start,
      repo: { owner: parsed.owner, repo: parsed.repo, ref },
      filesChecked: fileCount,
    };

    logger.info(
      {
        verdict,
        errorCount: errors.length,
        durationMs: result.durationMs,
        owner: parsed.owner,
        repo: parsed.repo,
        filesChecked: fileCount,
      },
      "debug/repo complete",
    );

    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "debug/repo failed");
    res.status(500).json({ error: err?.message ?? "Repo typecheck failed" });
  } finally {
    rm(join(tempDir, ".."), { recursive: true, force: true }).catch(() => {});
  }
});

/**
 * GET /api/debug/repo/status
 * Tells the client whether private-repo support is available.
 */
debugRepoRouter.get("/debug/repo/status", (_req: Request, res: Response) => {
  res.json({ privateReposSupported: isGitHubTokenConfigured() });
});

export default debugRepoRouter;
