// Dock guards: the hold ring must sit exactly on the icon, and the drawer
// height must be driven by shared values (never refs — a worklet captures
// its closure at install time, so a ref reads its initial value forever
// and the drawer stayed clipped to one row, 2026-11-10).
import { describe, expect, it } from 'vitest';
import {
  orderDockCategories,
  RING_CENTER_X,
  RING_CENTER_Y,
  RING_GEOMETRY,
  RING_ICON_CENTER_X,
  RING_ICON_CENTER_Y,
} from '../../components/dockHelpers';
import type { Category } from '../../types';

// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';

function cat(id: string, usageCount: number): Category {
  return {
    id,
    name: id,
    icon: 'custom',
    color: 'butter',
    usageCount,
  } as Category;
}

describe('dock drawer ordering', () => {
  it('orders most-used at both ends', () => {
    const ordered = orderDockCategories([cat('a', 10), cat('b', 1), cat('c', 5)]);
    expect(ordered[0]?.id).toBe('a');
    expect(ordered[ordered.length - 1]?.id).toBe('c');
  });

  it('shows every category (no collapsed strip to cap)', () => {
    const cats = [
      cat('a', 10),
      cat('b', 1),
      cat('c', 5),
      cat('d', 8),
      cat('e', 3),
      cat('f', 0),
    ];
    expect(orderDockCategories(cats)).toHaveLength(6);
  });
});

describe('dock hold ring alignment', () => {
  it('centers the ring exactly on the icon', () => {
    expect(RING_CENTER_X).toBe(RING_ICON_CENTER_X);
    expect(RING_ICON_CENTER_X).toBe(17);
  });

  it('centers the ring exactly on the icon vertically', () => {
    // The ring used to sit at top: '50%' + a negative margin, which
    // resolves against the node's content-box height (22) instead of its
    // full height (34), so it sat 6dp too high on device (2026-11-10).
    expect(RING_CENTER_Y).toBe(RING_ICON_CENTER_Y);
    expect(RING_ICON_CENTER_Y).toBe(17);
    expect(RING_GEOMETRY.ringTop).toBe(1);
  });

  it('hugs the icon with a 3dp gap', () => {
    // Ring circle diameter 28 = icon 22 + 2 * 3 gap; the 32dp box leaves
    // 2dp of breathing room around the stroke.
    expect(RING_GEOMETRY.ringRadius * 2).toBe(RING_GEOMETRY.iconSize + 6);
    expect(RING_GEOMETRY.ringSize - RING_GEOMETRY.ringRadius * 2).toBe(4);
  });
});

describe('dock drawer height', () => {
  it('drives the container height from shared values, never refs', () => {
    // Reported on device 2026-11-10: the expanded drawer was clipped to
    // its first row. The container-height worklet read rowHRef/gridHRef —
    // a worklet captures its closure when first installed, so `.current`
    // read 0 forever and the container stayed at row height. Heights must
    // be mirrored into shared values (the only live channel into a worklet).
    const start = DOCK_SRC.indexOf('const containerStyle = useAnimatedStyle');
    expect(start).toBeGreaterThan(-1);
    const end = DOCK_SRC.indexOf('});', start);
    const block = DOCK_SRC.slice(start, end);
    expect(block).toContain('HSV.value');
    expect(block).not.toContain('Ref.current');
  });
});

describe('dock drawer alignment', () => {
  it('centers every wrapped row of pills (justifyContent center on the grid)', () => {
    // Reported 2026-11-10: the drawer was left-flushed. The grid must
    // center each row.
    expect(DOCK_SRC).toContain("justifyContent: 'center'");
  });
});
