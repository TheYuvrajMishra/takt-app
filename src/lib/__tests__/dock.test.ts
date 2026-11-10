// Dock guards (reported on device 2026-11-10): the collapsed row showed
// 5–6 chips and the hold ring sat off the icon. These test the real pure
// helpers in components/dockHelpers.ts.
import { describe, expect, it } from 'vitest';
import {
  collapsedCountForWidth,
  orderDockCategories,
  RING_CENTER_X,
  RING_GEOMETRY,
  RING_ICON_CENTER_X,
  topDockCategories,
} from '../../components/dockHelpers';
import type { Category } from '../../types';

function cat(id: string, usageCount: number): Category {
  return {
    id,
    name: id,
    icon: 'custom',
    color: 'butter',
    usageCount,
  } as Category;
}

describe('dock collapsed row', () => {
  it('shows 3–4 chips, never 5–6', () => {
    expect(collapsedCountForWidth(360)).toBe(3);
    expect(collapsedCountForWidth(399)).toBe(3);
    expect(collapsedCountForWidth(400)).toBe(4);
    expect(collapsedCountForWidth(800)).toBe(4);
  });

  it('caps the collapsed row at that count, most-used first', () => {
    const cats = [
      cat('a', 10),
      cat('b', 1),
      cat('c', 5),
      cat('d', 8),
      cat('e', 3),
      cat('f', 0),
    ];
    const top = topDockCategories(cats, collapsedCountForWidth(360));
    expect(top).toHaveLength(3);
    expect(top.map((c) => c.id).sort()).toEqual(['a', 'c', 'd']);
  });

  it('orders most-used at both ends', () => {
    const ordered = orderDockCategories([cat('a', 10), cat('b', 1), cat('c', 5)]);
    expect(ordered[0]?.id).toBe('a');
    expect(ordered[ordered.length - 1]?.id).toBe('c');
  });
});

describe('dock hold ring alignment', () => {
  it('centers the ring exactly on the icon', () => {
    expect(RING_CENTER_X).toBe(RING_ICON_CENTER_X);
    expect(RING_ICON_CENTER_X).toBe(17);
  });

  it('hugs the icon with a 3dp gap', () => {
    // Ring circle diameter 28 = icon 22 + 2 * 3 gap; the 32dp box leaves
    // 2dp of breathing room around the stroke.
    expect(RING_GEOMETRY.ringRadius * 2).toBe(RING_GEOMETRY.iconSize + 6);
    expect(RING_GEOMETRY.ringSize - RING_GEOMETRY.ringRadius * 2).toBe(4);
  });
});
