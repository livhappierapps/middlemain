import { Router, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "node:path";
import { ANDROID_APK_URL } from "../lib/androidRelease";
import { workspaceRoot } from "../lib/workspacePaths";
import https from "https";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);
const downloadRouter = Router();
let archiveLookup: Promise<string> | null = null;
let cacheUntil = 0;

async function getLatestApkUrl(): Promise<string> {
  if (ANDROID_APK_URL) return validateArchiveUrl(ANDROID_APK_URL).href;
  if (process.env.NODE_ENV !== "development") throw new Error("No approved APK release is configured");
  if (archiveLookup && Date.now() < cacheUntil) return archiveLookup;
  cacheUntil = Date.now() + 60_000;
  archiveLookup = lookupApk().catch((error) => { archiveLookup = null; throw error; });
  return archiveLookup;
}

async function lookupApk(): Promise<string> {
  const root = workspaceRoot();
  const { stdout } = await execFileAsync("eas", [
    "build:list", "--platform", "android", "--status", "finished",
    "--build-profile", "preview", "--limit", "1", "--json", "--non-interactive",
  ], {
    cwd: path.join(root, "artifacts", "middlemain"),
    timeout: 30_000, maxBuffer: 1_000_000,
  });
  const builds = JSON.parse(stdout.trim());
  if (!Array.isArray(builds) || builds.length === 0) {
    throw new Error("No Android builds found");
  }
  const build = builds[0];
  const url =
    build.artifacts?.applicationArchiveUrl ??
    build.artifacts?.buildUrl ??
    null;
  if (build.status !== "FINISHED" || typeof url !== "string" || !new URL(url).pathname.endsWith(".apk")) {
    throw new Error("No completed preview APK is available");
  }
  validateArchiveUrl(url);
  return url;
}

export function validateArchiveUrl(value: string): URL {
  const url = new URL(value);
  const allowed = url.hostname === "expo.dev" || url.hostname === "storage.googleapis.com" ||
    url.hostname === "wf-artifacts.eascdn.net" ||
    url.hostname.endsWith(".expo.dev") || url.hostname.endsWith(".storage.googleapis.com");
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed) {
    throw new Error("Untrusted archive location");
  }
  return url;
}

function proxyStream(
  url: string,
  res: Response,
  filename: string,
  depth = 0
): void {
  if (depth > 5) {
    res.status(502).json({ error: "Too many redirects" });
    return;
  }

  let validated;
  try { validated = validateArchiveUrl(url); }
  catch { res.status(502).json({ error: "Untrusted archive location" }); return; }
  const request = https
    .get(validated, (upstream) => {
      if (
        upstream.statusCode &&
        upstream.statusCode >= 300 &&
        upstream.statusCode < 400 &&
        upstream.headers.location
      ) {
        proxyStream(new URL(upstream.headers.location, validated).href, res, filename, depth + 1);
        upstream.resume(); // drain so socket closes
        return;
      }

      if (upstream.statusCode !== 200) {
        res.status(502).json({ error: `Upstream returned ${upstream.statusCode}` });
        upstream.resume();
        return;
      }

      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      if (upstream.headers["content-length"]) {
        res.setHeader("Content-Length", upstream.headers["content-length"]);
      }
      upstream.pipe(res);
      upstream.on("error", () => res.destroy());
    })
    .on("error", (err) => {
      logger.error({ err }, "download proxy error");
      if (!res.headersSent) {
        res.status(502).json({ error: "Upstream connection failed" });
      }
    });
  request.setTimeout(20_000, () => request.destroy(new Error("Archive connection timed out")));
  res.once("close", () => request.destroy());
}

/**
 * GET /api/download/android
 *
 * Fetches the latest EAS Android build URL and proxies the APK
 * directly to the client — no Expo login required on the device.
 */
downloadRouter.get("/download/android", async (req: Request, res: Response) => {
  try {
    logger.info("download/android — fetching latest build URL");
    const apkUrl = await getLatestApkUrl();
    logger.info("download/android — proxying completed APK");
    proxyStream(apkUrl, res, "middlemain.apk");
  } catch (err: any) {
    logger.error({ err }, "download/android failed");
    if (!res.headersSent) {
      res.status(503).json({ error: "A completed APK is not available right now. Try again later." });
    }
  }
});

export default downloadRouter;
