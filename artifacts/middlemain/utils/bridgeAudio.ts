const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export class BridgeAudioFormatError extends Error {}

/** Strip a WAV container only after validating its actual encoding, not its filename. */
export function wavToBridgePcm(input: string): string {
  const fail = () => new BridgeAudioFormatError(
    'This recording is not PCM16, 24 kHz mono WAV. No audio was sent. The bridge needs a compatible recorder or server-side audio conversion; renaming the file cannot fix it.',
  );
  if (input.length > 3_000_000 || input.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) throw fail();
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const char of input.replace(/=+$/, '')) {
    value = (value << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); }
  }
  const data = Uint8Array.from(bytes);
  const view = new DataView(data.buffer);
  const tag = (offset: number) => String.fromCharCode(...data.slice(offset, offset + 4));
  if (data.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== data.length) throw fail();
  let validFormat = false;
  let pcm: Uint8Array | undefined;
  for (let offset = 12; offset + 8 <= data.length;) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > data.length) throw fail();
    if (tag(offset) === 'fmt ') {
      validFormat = size >= 16 && view.getUint16(start, true) === 1
        && view.getUint16(start + 2, true) === 1 && view.getUint32(start + 4, true) === 24000
        && view.getUint16(start + 12, true) === 2 && view.getUint16(start + 14, true) === 16;
    }
    if (tag(offset) === 'data') pcm = data.slice(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!validFormat || !pcm?.length || pcm.length % 2) throw fail();
  let output = '';
  for (let i = 0; i < pcm.length; i += 3) {
    const n = (pcm[i] << 16) | ((pcm[i + 1] ?? 0) << 8) | (pcm[i + 2] ?? 0);
    output += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63]
      + (i + 1 < pcm.length ? alphabet[(n >>> 6) & 63] : '=')
      + (i + 2 < pcm.length ? alphabet[n & 63] : '=');
  }
  return output;
}
