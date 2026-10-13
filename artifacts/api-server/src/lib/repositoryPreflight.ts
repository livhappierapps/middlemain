import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { repositoryPreflightWorker } from "./repositoryPreflightWorker";

const require = createRequire(import.meta.url);
export const PREFLIGHT_LIMITS = { files: 60, bytes: 220_000, fileBytes: 150_000, workers: 2, timeoutMs: 15_000 };
export interface RepositorySnapshot {
  owner: string; repo: string; branch: string; commit: string;
  files: { path: string; content: string }[];
  observedPaths: string[];
  partial: boolean;
  totalFiles: number;
}
export class PreflightError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function safePath(p: unknown): p is string {
  return typeof p === "string" && p.length > 0 && p.length <= 300 &&
    !/[\\\x00-\x1f:]/.test(p) && !p.startsWith("/") &&
    p.split("/").every(s => !!s && s !== "." && s !== "..") &&
    !/(^|\/)(node_modules|\.git|\.expo|dist|build|vendor|coverage)(\/|$)/.test(p) &&
    !/(credential|secret|private[-_]?key|service[-_]?account|(^|\/)\.env)/i.test(p);
}
export function validateRepositorySnapshot(value: unknown): RepositorySnapshot {
  const v = value as RepositorySnapshot;
  if (!v || ![v.owner, v.repo].every(s => typeof s === "string" && s.length <= 100 && /^[A-Za-z0-9_.-]+$/.test(s) && s !== "." && s !== "..") ||
      typeof v.branch !== "string" || !v.branch.trim() || v.branch.length > 200 || /[\x00-\x1f]/.test(v.branch) ||
      !/^[a-f0-9]{40,64}$/i.test(v.commit ?? "") ||
      !Array.isArray(v.files) || !v.files.length || v.files.length > PREFLIGHT_LIMITS.files ||
      !Array.isArray(v.observedPaths) || v.observedPaths.length > 1000 ||
      !Number.isInteger(v.totalFiles) || v.totalFiles < v.files.length || v.totalFiles > 1_000_000 ||
      typeof v.partial !== "boolean") throw new PreflightError("Invalid repository snapshot or file count.");
  const paths = new Set<string>();
  let bytes = 0;
  for (const f of v.files) {
    if (!f || !safePath(f.path) || !/\.(?:[cm]?[jt]sx?|json|ya?ml|toml|xml|plist|gradle|properties|xcconfig|pbxproj)$/i.test(f.path) ||
        typeof f.content !== "string" || paths.has(f.path)) throw new PreflightError("Unsafe, duplicate, or unsupported repository file path.");
    const size = Buffer.byteLength(f.content, "utf8");
    bytes += size;
    if (size > PREFLIGHT_LIMITS.fileBytes || bytes > PREFLIGHT_LIMITS.bytes) throw new PreflightError("Repository snapshot exceeds the source byte limits.", 413);
    paths.add(f.path);
  }
  if (v.observedPaths.some(p => !safePath(p))) throw new PreflightError("Unsafe repository listing path.");
  return { owner: v.owner, repo: v.repo, branch: v.branch, commit: v.commit,
    files: v.files.map(f => ({ path: f.path, content: f.content })),
    observedPaths: v.observedPaths, totalFiles: v.totalFiles,
    partial: v.partial || v.files.length < v.totalFiles };
}

let active = 0;
export function activeRepositoryChecks() { return active; }
export async function runRepositoryPreflight(value: unknown, options: { timeoutMs?: number; signal?: AbortSignal; workerFactory?: (code: string, options: any) => Worker } = {}) {
  const snapshot = validateRepositorySnapshot(value);
  if (options.signal?.aborted) throw new PreflightError("Repository check was cancelled.", 409);
  if (active >= PREFLIGHT_LIMITS.workers) throw new PreflightError("Two repository checks are already running. Try again after they finish.", 429);
  active++;
  const started = Date.now();
  let report: any = {
    repository: `${snapshot.owner}/${snapshot.repo}`, branch: snapshot.branch, commit: snapshot.commit,
    partial: snapshot.partial,
    coverage: { receivedFiles: snapshot.files.length, checkedSourceFiles: 0, totalFiles: snapshot.totalFiles,
      bytes: snapshot.files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf8"), 0) },
    findings: { syntaxTypes: [], dependencies: [], configuration: [], native: [
      { severity: "info", code: "NOT_RUN", message: "No EAS/native build, dependency installation, repository scripts, compiler plugins, or signing checks were run." },
    ] },
  };
  if (snapshot.partial) report.findings.configuration.push({
    severity: "warning", code: "PARTIAL_SNAPSHOT",
    message: "File/byte limits, filtered paths, a truncated listing, or failed downloads omitted part of the repository. Missing imports may be inconclusive.",
  });
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    worker = (options.workerFactory ?? ((code, opts) => new Worker(code, opts)))(
      // tsx/esbuild can inject a function-naming helper. Define it inside this
      // trusted worker scope rather than relying on the parent bundle's closure.
      `const __name = (fn) => fn; (${repositoryPreflightWorker.toString()})(require('node:worker_threads').workerData, require)`,
      { eval: true, workerData: { snapshot, report, compilerPath: require.resolve("typescript") },
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } },
    );
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (reason?: string) => {
        if (settled) return;
        settled = true;
        if (reason) {
          report.partial = true;
          report.findings.configuration.push({ severity: "warning", code: "CHECK_INCOMPLETE", message: reason });
        }
        resolve();
      };
      worker!.on("message", (message) => {
        if (settled) return;
        if (message.progress) report = message.progress;
        if (message.result) { report = message.result; finish(); }
      });
      worker!.on("error", () => finish("The isolated checker failed or exceeded its memory limit. Do not treat this partial report as a pass."));
      worker!.on("exit", () => finish("The isolated checker ended before producing a complete report."));
      cancel = () => finish("Repository check cancelled. Only findings collected before cancellation are retained.");
      options.signal?.addEventListener("abort", cancel, { once: true });
      if (options.signal?.aborted) cancel();
      timer = setTimeout(() => finish("The source checker timed out. Findings collected before the timeout are retained; remaining checks are unverified."),
        options.timeoutMs ?? PREFLIGHT_LIMITS.timeoutMs);
    });
  } catch {
    report.partial = true;
    report.findings.configuration.push({ severity: "warning", code: "CHECK_UNAVAILABLE", message: "The isolated source checker was unavailable; no complete check was performed." });
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) options.signal?.removeEventListener("abort", cancel);
    try { await worker?.terminate(); } finally { active--; }
  }
  const count = Object.values(report.findings).flat().filter((f: any) => f.severity === "error").length;
  report.status = report.partial ? "PARTIAL" : count ? "FINDINGS" : "NO_DEFINITE_SOURCE_ERRORS";
  report.durationMs = Date.now() - started;
  report.summary = `${count} definite error(s) in the supplied snapshot${report.partial ? "; partial coverage" : ""}. This static preflight never guarantees an EAS or native build will pass.`;
  return report;
}
