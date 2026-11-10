// Takt — Dock pure helpers. No react-native imports, so vitest can import
// the real values (same pattern as components/calendar/helpers.ts).
import type { Category } from '../types';

/** Collapsed row shows 3–4 chips (4 on wide screens, 3 on narrow) — the
    rest live in the swipe-up drawer. */
export function collapsedCountForWidth(width: number): number {
  return width >= 400 ? 4 : 3;
}

/**
 * Usage ordering: most-used categories sit at both ends, least-used in the
 * middle. Built inside-out: start from the least-used item in the middle and
 * wrap increasingly-used items around it, alternating sides.
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

/** The 3–4 most-used categories, ordered most-important at both ends. */
export function topDockCategories(categories: Category[], max: number): Category[] {
  const top = [...categories]
    .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    .slice(0, max);
  return orderDockCategories(top);
}

/**
 * Hold-ring geometry. The node is a horizontal pill: paddingLeft 6, icon
 * 22 wide, so the icon's center sits 17dp from the node's left edge — and
 * the ring's center must sit exactly there too (it was 2dp right and
 * oversized, so the ring looked unaligned with the icon). The ring hugs
 * the icon with a 3dp gap.
 */
export const RING_GEOMETRY = {
  nodePaddingLeft: 6,
  iconSize: 22,
  ringSize: 32,
  ringLeft: 1,
  ringRadius: 14,
} as const;

export const RING_ICON_CENTER_X =
  RING_GEOMETRY.nodePaddingLeft + RING_GEOMETRY.iconSize / 2;
export const RING_CENTER_X = RING_GEOMETRY.ringLeft + RING_GEOMETRY.ringSize / 2;
