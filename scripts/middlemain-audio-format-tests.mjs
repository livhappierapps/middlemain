import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp = await mkdtemp(join(tmpdir(), 'bridge-audio-'));
const target = join(temp, 'audio.mjs');
await writeFile(target, ts.transpileModule(
  await readFile(new URL('../artifacts/middlemain/utils/bridgeAudio.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText);
const { wavToBridgePcm } = await import(pathToFileURL(target).href);
after(() => rm(temp, { recursive: true, force: true }));
function wav(samples = Buffer.from([1, 2, 3, 4])) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}
test('audio strips WAV metadata and preserves exact PCM samples', () => {
  for (const length of [2, 4, 6, 120000]) {
    const pcm = Buffer.alloc(length, 193);
    assert.deepEqual(Buffer.from(wavToBridgePcm(wav(pcm).toString('base64')), 'base64'), pcm);
  }
});
test('wrong rate, channel count, codec and bit depth are rejected before transmission', () => {
  for (const [offset, value] of [[20, 3], [22, 2], [24, 44100], [34, 8]]) {
    const data = wav(); data.writeUInt16LE(value, offset);
    assert.throws(() => wavToBridgePcm(data.toString('base64')), /No audio was sent/);
  }
});
test('compressed files, truncated WAV and invalid base64 do not masquerade as PCM', () => {
  for (const value of ['invalid?', Buffer.from('webm compressed audio').toString('base64'), wav().subarray(0, 45).toString('base64')]) {
    assert.throws(() => wavToBridgePcm(value));
  }
});
