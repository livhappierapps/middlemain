/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function resolvePublicFile(root, relativePath) {
  // Check both the lexical path and the actual filesystem target. A prefix-only
  // check accepts sibling directories; a lexical-only check accepts symlinks.
  const isInside = (parent, target) => {
    const relative = path.relative(parent, target);
    return relative !== "" && !path.isAbsolute(relative) &&
      relative !== ".." && !relative.startsWith(`..${path.sep}`);
  };
  if (relativePath.includes("\\") || relativePath.includes("\0") ||
      relativePath.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  const rootPath = path.resolve(root);
  const filePath = path.resolve(rootPath, relativePath);
  if (!isInside(rootPath, filePath)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  const realRoot = fs.realpathSync(rootPath);
  const realFile = fs.realpathSync(filePath);
  if (!isInside(realRoot, realFile)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  if (!fs.statSync(realFile).isFile()) {
    throw Object.assign(new Error("Not Found"), { status: 404 });
  }
  return realFile;
}

function sendFileError(error, res) {
  const status = error.status || (error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500);
  res.writeHead(status);
  res.end(status === 403 ? "Forbidden" : status === 404 ? "Not Found" : "File unavailable");
}

function serveManifest(platform, res, staticRoot) {
  // Request headers never become a filesystem path.
  let manifest;
  try {
    switch (platform) {
      case "ios":
        manifest = fs.readFileSync(resolvePublicFile(staticRoot, "ios/manifest.json"), "utf-8");
        break;
      case "android":
        manifest = fs.readFileSync(resolvePublicFile(staticRoot, "android/manifest.json"), "utf-8");
        break;
      default:
        res.writeHead(400);
        res.end("Unsupported platform");
        return;
    }
  } catch (error) {
    return sendFileError(error, res);
  }
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  // These values are interpolated into both HTML and a script in the template.
  if (!["https", "http"].includes(protocol) || typeof host !== "string" ||
      !/^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/.test(host)) {
    res.writeHead(400);
    res.end("Invalid host or protocol");
    return;
  }
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  const escapedAppName = appName.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, () => escapedAppName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

function serveStaticFile(urlPath, res, staticRoot) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400);
    res.end("Malformed path");
    return;
  }
  try {
    const filePath = resolvePublicFile(staticRoot, decoded.replace(/^\/+/, ""));
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(content);
  } catch (error) {
    sendFileError(error, res);
  }
}

function createStaticServer({ staticRoot = STATIC_ROOT, mountPath = basePath } = {}) {
 const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
 const appName = getAppName();
 return http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    res.writeHead(400);
    res.end("Malformed URL");
    return;
  }
  let pathname = url.pathname;

  if (mountPath) {
    if (pathname !== mountPath && !pathname.startsWith(`${mountPath}/`)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    pathname = pathname.slice(mountPath.length) || "/";
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform !== undefined) {
      return serveManifest(platform, res, staticRoot);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res, staticRoot);
 });
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10);
  createStaticServer().listen(port, "0.0.0.0", () => {
    console.log(`Serving static Expo build on port ${port}`);
  });
}

module.exports = { createStaticServer, resolvePublicFile };
