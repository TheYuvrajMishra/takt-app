// Generate Takt's alarm sound: a clear two-tone alarm (880 / 1174 Hz
// beeps) as a 16-bit mono WAV. Written to assets/sounds/alarm.wav.
// Run: node scripts/gen-alarm-sound.mjs
// The alarm is LONG (~12s of repeating beeps, not one short blip):
// a nudge must sound like a real alarm that keeps demanding attention
// until the user presses Start or Done on the notification. iOS caps
// notification sounds at 30s, so 12s is safe.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE_RATE = 22050;
// One two-tone cycle (~0.74s), repeated so the alarm keeps ringing.
const CYCLE = [
  [880, 0.28],
  [0, 0.09],
  [1174, 0.28],
  [0, 0.09],
];
const REPEATS = 15;
// [frequency Hz, duration s] — two-tone beeps with short gaps.
const PATTERN = [...Array(REPEATS).fill(CYCLE).flat(), [880, 0.45]];
const AMPLITUDE = 0.65;

const totalSamples = Math.round(
  PATTERN.reduce((sum, [, d]) => sum + d, 0) * SAMPLE_RATE,
);
const pcm = new Int16Array(totalSamples);
let offset = 0;
for (const [freq, dur] of PATTERN) {
  const n = Math.round(dur * SAMPLE_RATE);
  for (let i = 0; i < n && offset < totalSamples; i++, offset++) {
    // Raised-cosine envelope (12ms attack/decay) so the beeps start and
    // stop cleanly instead of clicking.
    const t = i / SAMPLE_RATE;
    const envLen = Math.min(0.012, dur / 2);
    const env =
      t < envLen
        ? 0.5 - 0.5 * Math.cos((Math.PI * t) / envLen)
        : t > dur - envLen
          ? 0.5 - 0.5 * Math.cos((Math.PI * (dur - t)) / envLen)
          : 1;
    const sample =
      freq === 0 ? 0 : Math.sin(2 * Math.PI * freq * t) * AMPLITUDE * env;
    pcm[offset] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }
}

// Minimal WAV header (PCM, mono, 16-bit).
const dataSize = pcm.length * 2;
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataSize, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(dataSize, 40);

const out = join(root, 'assets', 'sounds', 'alarm.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, Buffer.from(pcm.buffer)]));
console.log(`wrote ${out} (${(44 + dataSize).toLocaleString()} bytes, ~${(totalSamples / SAMPLE_RATE).toFixed(1)}s)`);
