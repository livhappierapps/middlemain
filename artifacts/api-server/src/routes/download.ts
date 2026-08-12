import { Router, type Request, type Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import https from "https";
import http from "http";
import { logger } from "../lib/logger";

const execAsync = promisify(exec);
const downloadRouter = Router();

async function getLatestApkUrl(): Promise<string> {
  const { stdout } = await execAsync(
    "eas build:list --platform android --limit 1 --json --non-interactive",
    { cwd: "/home/runner/workspace/artifacts/middlemain" }
  );
  const builds = JSON.parse(stdout.trim());
  if (!Array.isArray(builds) || builds.length === 0) {
    throw new Error("No Android builds found");
  }
  const build = builds[0];
  const url =
    build.artifacts?.applicationArchiveUrl ??
    build.artifacts?.buildUrl ??
    null;
  if (!url) {
    throw new Error(
      `Build ${build.id} has no downloadable artifact (status: ${build.status})`
    );
  }
  return url as string;
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

  const client = url.startsWith("https://") ? https : http;

  client
    .get(url, (upstream) => {
      if (
        upstream.statusCode &&
        upstream.statusCode >= 300 &&
        upstream.statusCode < 400 &&
        upstream.headers.location
      ) {
        proxyStream(upstream.headers.location, res, filename, depth + 1);
        upstream.resume(); // drain so socket closes
        return;
      }

      if (!upstream.statusCode || upstream.statusCode >= 400) {
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
    })
    .on("error", (err) => {
      logger.error({ err }, "download proxy error");
      if (!res.headersSent) {
        res.status(502).json({ error: "Upstream connection failed" });
      }
    });
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
    logger.info({ apkUrl: apkUrl.slice(0, 80) + "…" }, "download/android — proxying");
    proxyStream(apkUrl, res, "middlemain.apk");
  } catch (err: any) {
    logger.error({ err }, "download/android failed");
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch APK" });
    }
  }
});

export default downloadRouter;
