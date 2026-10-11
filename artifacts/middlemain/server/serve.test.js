const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createStaticServer, resolvePublicFile } = require("./serve");

test("public file boundaries and manifest allowlist", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "expo-static-security-"));
  const root = path.join(tmp, "public");
  const sibling = path.join(tmp, "public-private");
  fs.mkdirSync(path.join(root, "ios"), { recursive: true });
  fs.mkdirSync(path.join(root, "android"));
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(root, "asset.js"), "public asset");
  fs.writeFileSync(path.join(root, "ios", "manifest.json"), '{"platform":"ios"}');
  fs.writeFileSync(path.join(root, "android", "manifest.json"), '{"platform":"android"}');
  fs.writeFileSync(path.join(sibling, "secret.txt"), "must not be served");
  fs.symlinkSync(path.join(sibling, "secret.txt"), path.join(root, "escape.txt"));
  fs.symlinkSync(sibling, path.join(root, "escape-dir"));
  const server = createStaticServer({ staticRoot: root, mountPath: "/middlemain" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const request = (urlPath, headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: server.address().port, path: urlPath, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });

  assert.equal((await request("/middlemain/asset.js")).body, "public asset");
  for (const attack of [
    "/middlemain/..%2fpublic-private%2fsecret.txt",
    "/middlemain/%2e%2e%2fpublic-private%2fsecret.txt",
    "/middlemain/escape.txt",
    "/middlemain/escape-dir/secret.txt",
    "/middlemain/%5c..%5csecret.txt",
    "/middlemain/asset.js%00",
  ]) {
    const response = await request(attack);
    assert.equal(response.status, 403, attack);
    assert.ok(!response.body.includes("must not be served"));
  }
  assert.equal((await request("/middlemain/%ZZ")).status, 400);
  assert.equal((await request("/middlemain/missing.js")).status, 404);
  assert.equal((await request("/middlemain-private/asset.js")).status, 404);
  assert.equal((await request("/middlemain/")).status, 200);
  assert.equal((await request("/middlemain/", { "x-forwarded-host": 'example.com"><script>alert(1)</script>' })).status, 400);
  assert.equal((await request("/middlemain/", { "x-forwarded-proto": 'javascript' })).status, 400);
  assert.throws(() => resolvePublicFile(root, "../public-private/secret.txt"), /Forbidden/);
  assert.equal((await request("/middlemain/manifest", { "expo-platform": "ios" })).body, '{"platform":"ios"}');
  assert.equal((await request("/middlemain/manifest", { "expo-platform": "android" })).body, '{"platform":"android"}');
  assert.equal((await request("/middlemain/manifest", { "expo-platform": "../public-private" })).status, 400);
  fs.unlinkSync(path.join(root, "ios", "manifest.json"));
  fs.symlinkSync(path.join(sibling, "secret.txt"), path.join(root, "ios", "manifest.json"));
  assert.equal((await request("/middlemain/manifest", { "expo-platform": "ios" })).status, 403);
});

test("bridge source ships no default credential and rejects missing keys", () => {
  const source = fs.readFileSync(path.join(__dirname, "../context/AisAndEarsContext.tsx"), "utf8");
  assert.ok(!source.includes("DEFAULT_API_KEY"));
  assert.match(source, /apiKey: ''/);
  assert.match(source, /if \(!config\.apiKey\.trim\(\)\)/);
});
