#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# submit-ios.sh — Submit a completed iOS build to TestFlight via EAS
#
# Reads App Store Connect credentials from Replit Secrets:
#   ASC_KEY_ID       — App Store Connect API Key ID
#   ASC_ISSUER_ID    — App Store Connect API Issuer ID
#   ASC_PRIVATE_KEY  — Full content of the .p8 private key file
#
# Usage:
#   ./scripts/submit-ios.sh                          # submits latest build
#   ./scripts/submit-ios.sh --path build.ipa         # submits specific file
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
umask 077

if [[ -z "${ASC_KEY_ID:-}" || -z "${ASC_ISSUER_ID:-}" || -z "${ASC_PRIVATE_KEY:-}" ]]; then
  echo "Missing one or more App Store Connect secrets."
  echo "   Required: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY"
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/../.." && pwd)"
TEMP_DIR="$(mktemp -d /tmp/middlemain-submit.XXXXXX)"
trap 'rm -rf "$TEMP_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Current EAS accepts ASC fields in eas.json, not --asc-api-key-* flags.
# Prepare an isolated project so credentials never modify the tracked config.
node - "$APP_DIR" "$TEMP_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [appDir, tmp] = process.argv.slice(2);
(async () => {
  const suppliedKey = process.env.ASC_PRIVATE_KEY.trim().replace(/\\r\\n|\\n/g, '\n');
  const pemBody = suppliedKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  let key;
  try {
    key = crypto.createPrivateKey(pemBody
      ? { key: Buffer.from(pemBody[1].replace(/\s/g, ''), 'base64'), format: 'der', type: 'pkcs8' }
      : suppliedKey);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error();
  } catch {
    console.error('ASC_PRIVATE_KEY is not a complete valid Apple .p8 key. Replace it using Secrets.');
    process.exitCode = 1;
    return;
  }
  const privateKey = key.export({ type: 'pkcs8', format: 'pem' }).toString();
  const keyPath = path.join(tmp, 'AuthKey.p8');
  fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
  const app = JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8'));
  let appId = process.env.ASC_APP_ID;
  if (!appId) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = `${encode({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' })}.${encode({
      iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1',
    })}`;
    const signature = crypto.sign('sha256', Buffer.from(body), {
      key: privateKey, dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    const url = new URL('https://api.appstoreconnect.apple.com/v1/apps');
    url.searchParams.set('filter[bundleId]', app.expo.ios.bundleIdentifier);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${body}.${signature}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(`App Store app lookup failed (HTTP ${response.status}); check ASC access.`);
      process.exitCode = 1;
      return;
    }
    appId = (await response.json()).data?.[0]?.id;
    if (!appId) {
      console.error('Create the app record in App Store Connect before submission, or supply ASC_APP_ID.');
      process.exitCode = 1;
      return;
    }
  }
  if (!/^\d+$/.test(appId)) throw new Error('ASC_APP_ID must be numeric');
  const config = JSON.parse(fs.readFileSync(path.join(appDir, 'eas.json'), 'utf8'));
  config.submit = { production: { ios: {
    ascAppId: appId, ascApiKeyPath: keyPath, ascApiKeyId: process.env.ASC_KEY_ID,
    ascApiKeyIssuerId: process.env.ASC_ISSUER_ID,
  } } };
  fs.writeFileSync(path.join(tmp, 'eas.json'), JSON.stringify(config), { mode: 0o600 });
  fs.copyFileSync(path.join(appDir, 'app.json'), path.join(tmp, 'app.json'));
  fs.copyFileSync(path.join(appDir, 'package.json'), path.join(tmp, 'package.json'));
  fs.symlinkSync(path.join(appDir, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
  if ((fs.statSync(keyPath).mode & 0o777) !== 0o600) throw new Error('ASC key permissions are unsafe');
  console.log('Submission configuration prepared securely; credential values omitted.');
})().catch(() => {
  // Do not print private key material, provider response bodies, or crypto errors.
  console.error('Could not prepare submission. Check ASC secret configuration and the App Store app record.');
  process.exitCode = 1;
});
NODE

if [[ "${MIDDLEMAIN_SUBMIT_DRY_RUN:-0}" == "1" ]]; then
  echo "Dry run only: configuration validated; no submission started."
  exit 0
fi
if [[ "$#" -eq 0 ]]; then set -- --latest; fi
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  if [[ "${ARGS[i]}" == "--path" && $((i + 1)) -lt ${#ARGS[@]} ]]; then
    ARGS[i+1]="$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "${ARGS[i+1]}")"
  elif [[ "${ARGS[i]}" == --path=* ]]; then
    ARGS[i]="--path=$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "${ARGS[i]#--path=}")"
  fi
done
cd "$TEMP_DIR"
# Buffer complete log lines before redacting, including PEM fragments and IDs.
EAS_NO_VCS=1 node - "$ROOT_DIR/node_modules/eas-cli/bin/run" "${ARGS[@]}" <<'NODE'
const { spawn } = require('node:child_process');
const [cli, ...args] = process.argv.slice(2);
const normalizedPem = require('node:fs').readFileSync('AuthKey.p8', 'utf8');
const fragments = [process.env.ASC_KEY_ID, process.env.ASC_ISSUER_ID,
  ...(process.env.ASC_PRIVATE_KEY ?? '').split(/\r?\n/),
  ...normalizedPem.split(/\r?\n/)].filter(Boolean);
function redact(line) {
  for (const fragment of fragments) line = line.split(fragment).join('[redacted]');
  return line.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [redacted]');
}
const child = spawn(process.execPath, [cli, 'submit', '--platform', 'ios',
  '--profile', 'production', '--non-interactive', '--wait', ...args],
  { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
for (const [source, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  let buffered = '';
  source.setEncoding('utf8');
  source.on('data', chunk => {
    buffered += chunk;
    let boundary;
    while ((boundary = buffered.indexOf('\n')) >= 0) {
      output.write(redact(buffered.slice(0, boundary + 1)));
      buffered = buffered.slice(boundary + 1);
    }
    if (buffered.length > 131072) { output.write('[Oversized EAS log line omitted]\n'); buffered = ''; }
  });
  source.on('end', () => { if (buffered) output.write(redact(buffered)); });
}
child.on('error', () => { console.error('Could not launch EAS submission.'); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
NODE
echo "Submission complete"
