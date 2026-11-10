// SHA-256 tests: NIST test vectors (FIPS 180-4) + incremental feeding.
import { describe, expect, it } from 'vitest';
import { base64ToBytes, sha256Hex, Sha256 } from '../sha256';

const enc = new TextEncoder();

describe('sha256Hex', () => {
  it('hashes the empty string', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes "abc"', () => {
    expect(sha256Hex(enc.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the 56-byte NIST vector', () => {
    expect(
      sha256Hex(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes 1,000,000 "a"s (multi-block, crosses the 55/56 padding edge)', () => {
    const data = new Uint8Array(1_000_000).fill(0x61);
    expect(sha256Hex(data)).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });
});

describe('Sha256 incremental', () => {
  it('matches the one-shot hash when fed in uneven chunks', () => {
    const data = enc.encode('the quick brown fox jumps over the lazy dog '.repeat(37));
    const s = new Sha256();
    s.update(data.subarray(0, 7));
    s.update(data.subarray(7, 100));
    s.update(data.subarray(100));
    const hex = Array.from(s.digest())
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex).toBe(sha256Hex(data));
  });
});

describe('base64ToBytes', () => {
  it('decodes with and without padding', () => {
    expect(Array.from(base64ToBytes('aGVsbG8='))).toEqual(Array.from(enc.encode('hello')));
    expect(Array.from(base64ToBytes('aGVsbG8'))).toEqual(Array.from(enc.encode('hello')));
    expect(Array.from(base64ToBytes(''))).toEqual([]);
  });

  it('round-trips binary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 255]);
    // Base64 of the bytes above (no Buffer in this tsconfig).
    expect(Array.from(base64ToBytes('AAECf4DI/w=='))).toEqual(Array.from(bytes));
  });

  it('decodes a 1 MB deterministic buffer with a 1-byte tail (the updater chunk shape)', { timeout: 15000 }, () => {
    // Guards the lookup-table decoder the updater relies on for a 53 MB
    // APK: every chunk is base64, the last chunk ends mid-group.
    // (Timeout raised: the 1 MB LCG loop takes ~2s alone and ~5s under
    // parallel load, which flaked on the default 5s timeout.)
    let seed = 12345;
    const bytes = new Uint8Array(1_000_001);
    for (let i = 0; i < bytes.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = seed % 256;
    }
    // Independent reference encoder (separate logic from the decoder).
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      b64 +=
        alpha[b0 >> 2] +
        alpha[((b0 & 3) << 4) | (b1 >> 4)] +
        (i + 1 < bytes.length ? alpha[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
        (i + 2 < bytes.length ? alpha[b2 & 63] : '=');
    }
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
  });
});
