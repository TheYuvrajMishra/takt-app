// Takt — large-text scaling for text styles. Pure (no react-native
// imports), so it is unit-testable. The key invariant: fontSize AND
// lineHeight scale by the same factor, so a scaled font never clips inside
// its fixed lineHeight (hero numerals, clock, chevrons). Components apply
// this to the flattened style (see components/TText).
import { LARGE_TEXT_SCALE } from './tokens';

export interface ScalableTextStyle {
  fontSize?: number;
  lineHeight?: number;
}

/** Scale a flat text style for large text; untouched when off. */
export function scaleTextStyle<T extends ScalableTextStyle>(
  style: T,
  largeText: boolean,
): T {
  if (!largeText) return style;
  const out = { ...style };
  if (typeof out.fontSize === 'number') {
    out.fontSize = Math.round(out.fontSize * LARGE_TEXT_SCALE);
  }
  if (typeof out.lineHeight === 'number') {
    out.lineHeight = Math.round(out.lineHeight * LARGE_TEXT_SCALE);
  }
  return out;
}
