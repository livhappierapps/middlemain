import { Router, type Request, type Response } from "express";
import { exec, execFile } from "child_process";
import { createRequire } from "module";
import { writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { logger } from "../lib/logger";
import { runRepositoryPreflight, PreflightError } from "../lib/repositoryPreflight";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const debugRouter = Router();
let activeChecks = 0;

debugRouter.post("/debug/repository-preflight", async (req: Request, res: Response) => {
  const controller = new AbortController();
  const cancelled = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", cancelled);
  res.once("close", cancelled);
  try {
    const result = await runRepositoryPreflight(req.body, { signal: controller.signal });
    logger.info({ status: result.status, files: result.coverage.receivedFiles, durationMs: result.durationMs }, "Repository source preflight complete");
    if (!res.destroyed) res.json(result);
  } catch (error) {
    const known = error instanceof PreflightError;
    if (!res.destroyed) res.status(known ? error.status : 500).json({ error: known ? error.message : "Repository preflight failed." });
  } finally {
    req.off("aborted", cancelled);
    res.off("close", cancelled);
  }
});

// Use the workspace-root tsc and middlemain's @types for full React Native awareness
const TYPE_ROOTS = join(process.cwd(), "../middlemain/node_modules/@types");

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiagnosticEntry {
  line: number;
  col: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

interface CheckResult {
  pass: boolean;
  verdict: "CLEAN" | "ERRORS" | "WARNINGS_ONLY";
  errors: DiagnosticEntry[];
  summary: string;
  rawOutput: string;
  durationMs: number;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseTscOutput(raw: string, tempFile: string): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  // tsc format: /path/to/file(line,col): error|warning TSxxxx: message
  const escaped = tempFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}\\((\\d+),(\\d+)\\):\\s+(error|warning)\\s+TS(\\d+):\\s+(.+)`
  );
  for (const line of raw.split("\n")) {
    const m = line.trim().match(re);
    if (m) {
      out.push({
        line: parseInt(m[1], 10),
        col: parseInt(m[2], 10),
        severity: m[3] as "error" | "warning",
        code: `TS${m[4]}`,
        message: m[5].trim(),
      });
    }
  }
  return out;
}

function buildSummary(errors: DiagnosticEntry[]): string {
  const errCount = errors.filter((e) => e.severity === "error").length;
  const warnCount = errors.filter((e) => e.severity === "warning").length;
  if (errCount === 0 && warnCount === 0) return "No issues found in this isolated file check. Project dependencies and native builds are not verified.";
  const parts: string[] = [];
  if (errCount > 0) parts.push(`${errCount} error${errCount > 1 ? "s" : ""}`);
  if (warnCount > 0) parts.push(`${warnCount} warning${warnCount > 1 ? "s" : ""}`);
  return parts.join(", ") + " in this isolated source check. This is not a complete project or native build.";
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/debug/typecheck
 * Body: { code: string, mode?: "expo" | "typescript" | "javascript" | "general" }
 *
 * Writes the code to a temp file and runs the real TypeScript compiler against it,
 * using the middlemain project's @types for React Native awareness.
 * Returns structured diagnostics + a build verdict.
 */
debugRouter.post("/debug/typecheck", async (req: Request, res: Response) => {
  const { code, mode = "expo" } = req.body as {
    code?: string;
    mode?: string;
  };

  if (!code || typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "No code provided" });
    return;
  }
  if (!["expo", "typescript", "javascript", "general"].includes(mode)) {
    res.status(400).json({ error: "Unsupported source-check mode." });
    return;
  }
  if (Buffer.byteLength(code, "utf8") > 300_000) {
    res.status(400).json({ error: "Code too large — max 300 KB" });
    return;
  }
  if (activeChecks >= 2) { res.status(429).json({ error: "Two source checks are already running. Try again after they finish." }); return; }
  activeChecks++;

  const isJS = mode === "javascript";
  const ext = isJS ? ".jsx" : ".tsx";
  const tempDir = join(tmpdir(), `mm-debug-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const tempFile = join(tempDir, `check${ext}`);
  const start = Date.now();
  const controller = new AbortController();
  const cancelIfDisconnected = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", cancelIfDisconnected);
  res.once("close", cancelIfDisconnected);

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(tempFile, code, "utf8");

    const jsxMode = isJS || mode === "general" ? "react" : "react-native";

    const flags = [
      "--noEmit",
      // Never follow user-supplied imports or triple-slash paths into server files.
      "--noResolve",
      "--allowJs",
      "--checkJs",
      "--jsx", jsxMode,
      "--esModuleInterop",
      "--allowSyntheticDefaultImports",
      "--skipLibCheck",
      "--target", "ES2020",
      "--lib", "ES2020,DOM",
      "--moduleResolution", "node",
      "--typeRoots", TYPE_ROOTS,
      // Permissive — we want real errors, not strict-mode noise
      "--strict", "false",
      "--noImplicitAny", "false",
      "--noUnusedLocals", "false",
      "--noUnusedParameters", "false",
    ];

    let rawOutput = "";
    let compilerFailed = false;

    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [require.resolve("typescript/bin/tsc"), ...flags, tempFile],
        { timeout: 30_000, maxBuffer: 1_000_000, signal: controller.signal },
      );
      rawOutput = (stdout + stderr).trim();
    } catch (err: any) {
      if (controller.signal.aborted) return;
      // tsc exits non-zero when errors found — that's expected
      rawOutput = ((err.stdout ?? "") + (err.stderr ?? "")).trim();
      compilerFailed = true;
      if (err.killed || !rawOutput) rawOutput = "The compiler could not complete this check (unavailable, timed out, or output limit reached).";
    }

    const errors = parseTscOutput(rawOutput, tempFile);
    if (compilerFailed && errors.length === 0) errors.push({ line: 0, col: 0, code: "CHECK_FAILED", severity: "error", message: "The compiler did not complete a verifiable check. See the output; do not treat this as a pass." });
    const hasErrors = errors.some((e) => e.severity === "error");
    const hasWarnings = errors.some((e) => e.severity === "warning");

    const verdict: CheckResult["verdict"] = hasErrors
      ? "ERRORS"
      : hasWarnings
      ? "WARNINGS_ONLY"
      : "CLEAN";

    // Scrub the temp path so only line numbers show in the output
    const scrubbed = rawOutput
      .replace(new RegExp(tempFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<pasted-code>")
      .replace(new RegExp(tempDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");

    const result: CheckResult = {
      pass: !hasErrors,
      verdict,
      errors,
      summary: buildSummary(errors),
      rawOutput: scrubbed,
      durationMs: Date.now() - start,
    };

    if (controller.signal.aborted || res.destroyed) return;
    logger.info(
      { verdict, errorCount: errors.length, durationMs: result.durationMs },
      "debug/typecheck complete"
    );

    res.json(result);
  } catch (err: any) {
    if (controller.signal.aborted || res.destroyed) return;
    logger.error({ err }, "debug/typecheck failed");
    res.status(500).json({ error: err?.message ?? "Typecheck failed" });
  } finally {
    req.off("aborted", cancelIfDisconnected);
    res.off("close", cancelIfDisconnected);
    activeChecks--;
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

/**
 * GET /api/debug/build-status
 * Returns the latest EAS Android + iOS build status so council agents can check it.
 */
debugRouter.get("/debug/build-status", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync(
      "cd /home/runner/workspace/artifacts/middlemain && npx eas build:list --limit 4 --json --non-interactive 2>/dev/null",
      { timeout: 20_000 }
    );

    // eas build:list outputs a JSON array, possibly with leading npm notices
    const jsonStart = stdout.indexOf("[");
    if (jsonStart === -1) {
      res.status(502).json({ error: "Could not parse EAS response" });
      return;
    }

    const builds = JSON.parse(stdout.slice(jsonStart)) as Array<{
      id: string;
      status: string;
      platform: string;
      appVersion?: string;
      buildProfile?: string;
      createdAt?: string;
      completedAt?: string;
      expirationDate?: string;
      artifacts?: { buildUrl?: string; applicationArchiveUrl?: string };
    }>;

    const summary = builds.map((b) => ({
      id: b.id,
      platform: b.platform,
      status: b.status,
      profile: b.buildProfile,
      version: b.appVersion,
      createdAt: b.createdAt,
      completedAt: b.completedAt,
      expires: b.expirationDate,
      downloadUrl: b.artifacts?.applicationArchiveUrl ?? b.artifacts?.buildUrl ?? null,
    }));

    logger.info({ count: summary.length }, "debug/build-status fetched");
    res.json({ builds: summary, fetchedAt: new Date().toISOString() });
  } catch (err: any) {
    logger.error({ err }, "debug/build-status failed");
    res.status(500).json({ error: err?.message ?? "Failed to fetch build status" });
  }
});

export default debugRouter;
