import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'middlemain-camera-'));
const source = await readFile(new URL('../artifacts/middlemain/utils/bridgeVision.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const target = join(temp, 'bridgeVision.mjs');
await writeFile(target, output);
const { deliverVisionFrame, bridgeBottomClearance } = await import(pathToFileURL(target).href);
after(() => rm(temp, { recursive: true, force: true }));

const session = { sessionId: 'test-session', visionUrl: 'https://bridge.example/vision' };
const image = 'data:image/jpeg;base64,TEST';
test('one camera frame sends the documented payload once and returns the description', async () => {
  let calls = 0;
  const reply = await deliverVisionFrame(session, image, 'camera', async (url, init) => {
    calls++;
    assert.equal(url, session.visionUrl);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { sessionId: session.sessionId, imageData: image, prompt: 'What do you observe?', isFirstFrame: false });
    return new Response(JSON.stringify({ message: 'A test object.' }));
  });
  assert.equal(reply, 'A test object.');
  assert.equal(calls, 1);
});

test('accepted image without a description is not represented as an AI reply', async () => {
  for (const data of [{}, { message: '' }, { message: 42 }, null]) {
    assert.equal(await deliverVisionFrame(session, image, 'camera', async () => new Response(JSON.stringify(data))), null);
  }
});

test('bridge HTTP failures are actionable, never echo raw provider secrets, and do not retry', async () => {
  for (const [status, hint] of [[401, /authorization/], [403, /authorization/], [404, /endpoint/], [413, /large/], [429, /limit/], [500, /service/]]) {
    let calls = 0;
    await assert.rejects(deliverVisionFrame(session, image, 'camera', async () => {
      calls++;
      return new Response('PRIVATE_CREDENTIAL_DO_NOT_DISPLAY', { status });
    }), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.match(error.message, hint);
      assert.doesNotMatch(error.message, /PRIVATE_CREDENTIAL/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('network failures do not leak signed URLs or silently retry', async () => {
  let calls = 0;
  await assert.rejects(deliverVisionFrame(session, image, 'camera', async () => {
    calls++;
    throw new Error('secret token at https://private.example?key=credential');
  }), error => {
    assert.match(error.message, /No automatic retry/);
    assert.doesNotMatch(error.message, /credential|private.example/);
    return true;
  });
  assert.equal(calls, 1);
});

test('a pre-cancelled frame never makes a request', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(deliverVisionFrame(session, image, 'camera', async () => { calls++; }, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('cancelling an upload passes cancellation to the transport', async () => {
  const controller = new AbortController();
  const result = deliverVisionFrame(session, image, 'camera', async (_url, init) => {
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  }, controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
});

test('timeout reports unknown delivery without claiming a failed upload or retrying', async () => {
  let calls = 0;
  await assert.rejects(deliverVisionFrame(session, image, 'camera', async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  }, undefined, 5), /timed out.*Delivery is unknown/);
  assert.equal(calls, 1);
});

test('an unreadable accepted response does not retry potentially billed processing', async () => {
  let calls = 0;
  await assert.rejects(deliverVisionFrame(session, image, 'camera', async () => { calls++; return new Response('<html>no JSON</html>'); }), /already have processed/);
  assert.equal(calls, 1);
});

test('screen frames retain their distinct prompt', async () => {
  await deliverVisionFrame(session, image, 'screen', async (_url, init) => {
    assert.equal(JSON.parse(init.body).prompt, 'Describe what you see on this screen.');
    return new Response('{}');
  });
});

test('Bridge reserves bottom-menu clearance on iPhone, Android, and web', () => {
  assert.equal(bridgeBottomClearance('ios', true, 34), 98);
  assert.equal(bridgeBottomClearance('ios', false, 34), 83);
  assert.equal(bridgeBottomClearance('android', false, 16), 65);
  assert.equal(bridgeBottomClearance('web', false, 0), 84);
});

test('camera UI uses a real visible preview, explicit send, readiness, cancellation, and sequential requests', async () => {
  const component = await readFile(new URL('../artifacts/middlemain/components/BridgeCameraPreview.tsx', import.meta.url), 'utf8');
  const terminal = await readFile(new URL('../artifacts/middlemain/app/(tabs)/terminal.tsx', import.meta.url), 'utf8');
  assert.match(component, /onCameraReady=/);
  assert.match(component, /Send one frame/);
  assert.match(component, /bridge\/provider charges/);
  assert.match(component, /AppState\.addEventListener/);
  assert.match(component, /useFocusEffect/);
  assert.match(component, /controller\.current\?\.abort/);
  assert.match(component, /inFlight\.current/);
  assert.doesNotMatch(component, /setInterval/);
  assert.match(component, /setTimeout\(\(\) => \{ void sendOne\(\); \}, 3000\)/);
  assert.match(terminal, /<BridgeCameraPreview/);
  assert.doesNotMatch(terminal, /Hidden CameraView|cameraIntervalRef/);
  assert.match(terminal, /bridgeBottomClearance\(Platform\.OS/);
});

test('microphone file operations use the supported SDK 54 legacy API and cancelled chunks are gated', async () => {
  const context = await readFile(new URL('../artifacts/middlemain/context/AisAndEarsContext.tsx', import.meta.url), 'utf8');
  assert.match(context, /from 'expo-file-system\/legacy'/);
  assert.match(context, /audioGenerationRef\.current \+= 1/);
  assert.match(context, /generation !== audioGenerationRef\.current/);
  assert.match(context, /Microphone recording or delivery failed/);
});
