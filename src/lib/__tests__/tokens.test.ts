// Tokens tests: large-text scaling and colour-blind category patterns.
// These are pure (tokens.ts has no imports), so they run in node.
import { describe, expect, it } from 'vitest';
import {
  categoryPattern,
  LARGE_TEXT_SCALE,
  patternForCategory,
  scaledFontSize,
} from '../../theme/tokens';
import { DEFAULT_CATEGORIES } from '../../types';

describe('scaledFontSize', () => {
  it('leaves sizes alone when large text is off', () => {
    expect(scaledFontSize(16, false)).toBe(16);
    expect(scaledFontSize(12, false)).toBe(12);
  });

  it('scales by LARGE_TEXT_SCALE and rounds when on', () => {
    expect(scaledFontSize(16, true)).toBe(Math.round(16 * LARGE_TEXT_SCALE));
    expect(scaledFontSize(12, true)).toBe(14); // 12 * 1.18 = 14.16
  });

  it('keeps the scale modest (1.1–1.25) so fixed-height rows do not clip badly', () => {
    expect(LARGE_TEXT_SCALE).toBeGreaterThanOrEqual(1.1);
    expect(LARGE_TEXT_SCALE).toBeLessThanOrEqual(1.25);
    // The real anti-clip proof is in textScale.test.ts: lineHeight scales
    // with fontSize, so the font:lineHeight ratio is preserved.
  });
});

describe('categoryPattern', () => {
  it('gives every colour a distinct pattern', () => {
    const patterns = Object.values(categoryPattern);
    expect(patterns.length).toBe(6);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('gives every default category a distinct (colour, pattern) pair', () => {
    // Several defaults share a colour (Job/Sleep carbon, Learning/Project
    // violet, Gaming/Study butter, Food/Custom apricot); the per-category
    // overrides must make each pair unique.
    const pairs = DEFAULT_CATEGORIES.map(
      (c) => `${c.color}:${patternForCategory(c)}`,
    );
    expect(pairs.length).toBe(10);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('falls back to the colour pattern for custom categories', () => {
    expect(patternForCategory({ id: 'cat-whatever', color: 'mint' })).toBe(
      categoryPattern.mint,
    );
  });
});
