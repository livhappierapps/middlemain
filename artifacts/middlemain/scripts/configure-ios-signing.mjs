#!/usr/bin/env node
// Sets up EAS remote signing; --build queues production with the same temporary ASC key.
// Never approves revocation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';

const required = ['ASC_PRIVATE_KEY', 'ASC_KEY_ID', 'ASC_ISSUER_ID'];
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--build')) {
  console.error('Usage: node configure-ios-signing.mjs [--build]');
  process.exit(1);
}
const build = args.includes('--build');
if (required.some(name => !process.env[name])) {
  console.error('Required ASC secrets are missing.');
  process.exit(1);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'middlemain-signing-'));
fs.chmodSync(dir, 0o700);
let child;
let cleaned = false;
const cleanup = () => {
  if (!cleaned) {
    cleaned = true;
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
try {
  const supplied = process.env.ASC_PRIVATE_KEY.trim().replace(/\\r\\n|\\n/g, '\n');
  const pem = supplied.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  const key = crypto.createPrivateKey(pem
    ? { key: Buffer.from(pem[1].replace(/\s/g, ''), 'base64'), format: 'der', type: 'pkcs8' }
    : supplied);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Invalid Apple key type');
  }
  const keyPath = path.join(dir, 'AuthKey.p8');
  fs.writeFileSync(keyPath, key.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const env = {
    ...process.env,
    EXPO_ASC_API_KEY_PATH: keyPath,
    EXPO_ASC_KEY_ID: process.env.ASC_KEY_ID,
    EXPO_ASC_ISSUER_ID: process.env.ASC_ISSUER_ID,
    EXPO_APPLE_TEAM_ID: 'FQKYZ4S892',
    EXPO_APPLE_TEAM_TYPE: 'INDIVIDUAL',
    EAS_SKIP_AUTO_FINGERPRINT: '1',
    TERM: 'xterm',
  };
  delete env.CI; // An empty CI value is not a valid Expo boolean.
  child = spawn('script', [
    '-q', '-e', '-c',
    build
      ? 'pnpm exec eas build --platform ios --profile production --non-interactive --no-wait'
      : 'pnpm exec eas credentials:configure-build --platform ios --profile production',
    '/dev/null',
  ], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const secrets = required.map(name => process.env[name]);
  const redact = text => secrets.reduce((out, value) => out.split(value).join('[redacted]'), text);
  const answered = new Set();
  const prompts = [
    ['login', /Do you want to log in to your Apple account\?/i],
    ['certificate', /Generate a new Apple Distribution Certificate\?/i],
    ['profile', /Generate a new Apple Provisioning Profile\?/i],
  ];
  let buffer = '';
  let lineBuffer = '';
  let stopped = false;
  const receive = chunk => {
    const text = stripVTControlCharacters(chunk.toString()).replace(/\r/g, '\n');
    buffer = (buffer + text).slice(-12000);
    lineBuffer += text;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      if (/-----.*PRIVATE KEY-----|^[A-Za-z0-9+/=]{40,}$/i.test(line.trim())) {
        console.log('[Credential material omitted]');
      } else {
        console.log(redact(line));
      }
    }
    if (!stopped && /(?:revoke|delete).{0,80}(?:certificate|credential)|Apple ID:|Apple ID password|two.factor|verification code/i.test(buffer)) {
      stopped = true;
      console.error('Stopped on an unapproved credential action or interactive Apple login.');
      child.kill('SIGTERM');
      return;
    }
    for (const [name, pattern] of prompts) {
      if (pattern.test(buffer) && !answered.has(name)) {
        answered.add(name);
        console.log(`Approved signing prompt: ${name}`);
        child.stdin.write('y\n');
      }
    }
  };
  child.stdout.on('data', receive);
  child.stderr.on('data', receive);
  child.stdin.on('error', () => {
    stopped = true;
    child.kill('SIGTERM');
    cleanup();
  });
  const timer = setTimeout(() => {
    console.error('Signing setup timed out.');
    child.kill('SIGTERM');
  }, 240_000);
  child.on('error', () => {
    clearTimeout(timer);
    cleanup();
    console.error('Could not start EAS signing setup.');
    process.exitCode = 1;
  });
  child.on('close', code => {
    clearTimeout(timer);
    if (lineBuffer.trim()) console.log(redact(lineBuffer));
    cleanup();
    console.log(`Signing setup exit: ${code}`);
    process.exitCode = stopped ? 1 : (code ?? 1);
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      child.kill('SIGTERM');
      cleanup();
      process.exit(1);
    });
  }
} catch {
  cleanup();
  console.error('Signing setup could not be prepared; credential details omitted.');
  process.exitCode = 1;
}
