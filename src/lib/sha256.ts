// Takt — pure-TypeScript SHA-256 (FIPS 180-4), incremental.
//
// Why not expo-crypto: digestStringAsync hashes a UTF-8 *string*, and
// expo-file-system has no file-hash API in SDK 58 — hashing the base64
// text of the APK would not equal the release's sha256 of the APK bytes.
// So the updater reads the downloaded APK in 4 MB chunks, decodes each
// chunk from base64, and feeds the raw bytes here. Verified against the
// NIST test vectors in sha256.test.ts.
const K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export class Sha256 {
  private h: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private totalLen = 0;
  /** Reused message schedule — allocating a fresh 64-entry array + a
      DataView per 64-byte block made the 53 MB APK hash take minutes on
      a phone (830k allocations). */
  private w = new Array<number>(64);

  update(data: Uint8Array): void {
    this.totalLen += data.length;
    let offset = 0;
    if (this.bufLen > 0) {
      const need = 64 - this.bufLen;
      const take = Math.min(need, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      offset = take;
      if (this.bufLen === 64) {
        this.compress(this.buf, 0);
        this.bufLen = 0;
      }
    }
    while (offset + 64 <= data.length) {
      this.compress(data, offset);
      offset += 64;
    }
    if (offset < data.length) {
      this.buf.set(data.subarray(offset), 0);
      this.bufLen = data.length - offset;
    }
  }

  digest(): Uint8Array {
    const bitLen = this.totalLen * 8;
    // Padding: 0x80, zeros, then the 64-bit big-endian length.
    this.update(new Uint8Array([0x80]));
    while (this.bufLen !== 56) this.update(new Uint8Array([0]));
    const lenBytes = new Uint8Array(8);
    const view = new DataView(lenBytes.buffer);
    // totalLen < 2^32 bytes for any APK we ship, so the high word is 0.
    view.setUint32(4, bitLen >>> 0);
    this.update(lenBytes);
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, this.h[i]);
    return out;
  }

  private compress(block: Uint8Array, off: number): void {
    const w = this.w;
    // Big-endian words, read straight from the bytes: no per-block
    // DataView (830k of them for a 53 MB APK). Shifts are mod 2^32, so
    // the signedness of `<< 24` does not change any bit pattern.
    for (let i = 0; i < 16; i++) {
      const o = off + i * 4;
      w[i] = (block[o] << 24) | (block[o + 1] << 16) | (block[o + 2] << 8) | block[o + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = this.h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + h) | 0;
  }
}

export function sha256Hex(data: Uint8Array): string {
  const s = new Sha256();
  s.update(data);
  return Array.from(s.digest())
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Char-code -> 6-bit value lookup (255 = invalid). The old decoder called
 * `B64_ALPHABET.indexOf(clean[i])` per character — an O(64) scan plus a
 * one-char string allocation per byte, ~78M of them for a 53 MB APK.
 * A table lookup via charCodeAt is O(1) with no allocation.
 */
const B64_TABLE: Uint8Array = (() => {
  const t = new Uint8Array(256).fill(255);
  for (let i = 0; i < B64_ALPHABET.length; i++) t[B64_ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/** Decode a base64 string (no whitespace) to raw bytes. Throws on bad input. */
export function base64ToBytes(b64: string): Uint8Array {
  // Strip padding by length, not a regex (regex on a multi-MB string).
  let len = b64.length;
  if (len > 0 && b64.charCodeAt(len - 1) === 61) len--; // '='
  if (len > 0 && b64.charCodeAt(len - 1) === 61) len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n0 = B64_TABLE[b64.charCodeAt(i)];
    const n1 = B64_TABLE[b64.charCodeAt(i + 1)];
    const n2 = i + 2 < len ? B64_TABLE[b64.charCodeAt(i + 2)] : 0;
    const n3 = i + 3 < len ? B64_TABLE[b64.charCodeAt(i + 3)] : 0;
    if (n0 > 63 || n1 > 63 || n2 > 63 || n3 > 63) throw new Error('Invalid base64');
    const triple = (n0 << 18) | (n1 << 12) | (n2 << 6) | n3;
    out[o++] = (triple >> 16) & 0xff;
    if (i + 2 < len) out[o++] = (triple >> 8) & 0xff;
    if (i + 3 < len) out[o++] = triple & 0xff;
  }
  return out.subarray(0, o);
}
