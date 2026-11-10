// Takt — Dock pure helpers. No react-native imports, so vitest can import
// the real values (same pattern as components/calendar/helpers.ts).
import type { Category } from '../types';

/**
 * Usage ordering: most-used categories sit at both ends, least-used in the
 * middle. Built inside-out: start from the least-used item in the middle and
 * wrap increasingly-used items around it, alternating sides. The drawer
 * shows ALL categories in this order (the collapsed strip is gone).
 */
export function orderDockCategories(categories: Category[]): Category[] {
  const ascending = [...categories].sort(
    (a, b) => (a.usageCount ?? 0) - (b.usageCount ?? 0),
  );
  const out: Category[] = [];
  ascending.forEach((cat, i) => {
    if (i % 2 === 0) out.unshift(cat);
    else out.push(cat);
  });
  return out;
}

/**
 * Hold-ring geometry. The node is a horizontal pill: paddingLeft 6, icon
 * 22 wide, so the icon's center sits 17dp from the node's left edge — and
 * the ring's center must sit exactly there too (it was 2dp right and
 * oversized, so the ring looked unaligned with the icon). The ring hugs
 * the icon with a 3dp gap.
 *
 * The Y axis is the same geometry, not a percentage: the ring used to sit
 * at `top: '50%'` + a negative margin, which resolves against the node's
 * content-box height (22) instead of its full height (34 = icon + 2x6
 * padding), so the ring sat 6dp too high. The explicit top below puts the
 * ring's center exactly on the icon's center (17dp from the node's top).
 * This assumes the icon (22) is the node's tallest child — true while the
 * label stays a single 14px line (~20dp).
 */
export const RING_GEOMETRY = {
  nodePaddingLeft: 6,
  nodePaddingVertical: 6,
  iconSize: 22,
  ringSize: 32,
  ringLeft: 1,
  /** Explicit top (no `top: '50%'` — see the note above): 6 + 11 - 16. */
  ringTop: 1,
  ringRadius: 14,
} as const;

export const RING_ICON_CENTER_X =
  RING_GEOMETRY.nodePaddingLeft + RING_GEOMETRY.iconSize / 2;
export const RING_CENTER_X = RING_GEOMETRY.ringLeft + RING_GEOMETRY.ringSize / 2;

export const RING_ICON_CENTER_Y =
  RING_GEOMETRY.nodePaddingVertical + RING_GEOMETRY.iconSize / 2;
export const RING_CENTER_Y = RING_GEOMETRY.ringTop + RING_GEOMETRY.ringSize / 2;
