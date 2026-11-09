// textScale tests: the pure large-text scaling used by TText. The key
// invariant is that lineHeight scales with fontSize, so scaled text never
// clips inside a fixed lineHeight (hero score 110 in lineHeight 118,
// clock 64 in 72, chevrons 20 in 22).
import { describe, expect, it } from 'vitest';
import { scaleTextStyle } from '../../theme/textScale';
import { LARGE_TEXT_SCALE } from '../../theme/tokens';

describe('scaleTextStyle', () => {
  it('leaves the style untouched when large text is off', () => {
    const style = { fontSize: 16, lineHeight: 20 };
    expect(scaleTextStyle(style, false)).toBe(style);
  });

  it('scales fontSize and lineHeight by the same factor when on', () => {
    const scaled = scaleTextStyle({ fontSize: 16, lineHeight: 20 }, true);
    expect(scaled.fontSize).toBe(Math.round(16 * LARGE_TEXT_SCALE));
    expect(scaled.lineHeight).toBe(Math.round(20 * LARGE_TEXT_SCALE));
  });

  it('preserves the fontSize:lineHeight ratio (the anti-clip invariant)', () => {
    const style = { fontSize: 110, lineHeight: 118 }; // hero score
    const scaled = scaleTextStyle(style, true);
    expect(scaled.fontSize).toBeGreaterThan(style.fontSize);
    expect(scaled.lineHeight).toBeGreaterThan(scaled.fontSize!);
    const ratioBefore = style.lineHeight / style.fontSize;
    const ratioAfter = scaled.lineHeight! / scaled.fontSize!;
    expect(Math.abs(ratioAfter - ratioBefore)).toBeLessThan(0.02);
  });

  it('scales the app’s tightest fixed lineHeights past their scaled font', () => {
    // hero score 110 → 130 needs lineHeight > 130; clock 64 → 76 needs > 76;
    // chevrons 20 → 24 need > 24.
    expect(scaleTextStyle({ fontSize: 110, lineHeight: 118 }, true)).toEqual({
      fontSize: 130,
      lineHeight: 139,
    });
    expect(scaleTextStyle({ fontSize: 64, lineHeight: 72 }, true)).toEqual({
      fontSize: 76,
      lineHeight: 85,
    });
    expect(scaleTextStyle({ fontSize: 20, lineHeight: 22 }, true)).toEqual({
      fontSize: 24,
      lineHeight: 26,
    });
  });

  it('scales lineHeight even when fontSize is inherited (absent)', () => {
    expect(scaleTextStyle({ lineHeight: 20 }, true).lineHeight).toBe(
      Math.round(20 * LARGE_TEXT_SCALE),
    );
  });

  it('leaves styles without fontSize/lineHeight alone and does not mutate', () => {
    const style = { fontSize: undefined, fontWeight: '700' as const };
    const scaled = scaleTextStyle(style, true);
    expect(scaled).toEqual(style);
    expect(scaled).not.toBe(style);
  });
});
