// Drawer alignment guards (fresh, 2026-11-11): the category drawer
// must be centre-aligned, and a swipe starting on the up-arrow must
// open it — not just a swipe on the navbar bar or a tap on the arrow.
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import LAYOUT_SRC from '../../app/(tabs)/_layout.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('drawer pills are centre-aligned', () => {
  it('centres each wrapped row of the drawer grid', () => {
    // The grid is a wrapping row: without justifyContent the last row
    // sits left-aligned against the edge and reads as a broken layout.
    const start = DOCK_SRC.indexOf('grid: {');
    expect(start).toBeGreaterThan(-1);
    const end = DOCK_SRC.indexOf('},', start);
    const block = DOCK_SRC.slice(start, end);
    expect(block).toContain("justifyContent: 'center'");
  });
});

describe('swipe on the arrow opens the drawer', () => {
  it('wraps the arrow and the navbar bar in the same swipe-up detector', () => {
    // The arrow used to be a lone Pressable above the bar, outside the
    // swipe-up Pan — a swipe starting on it did nothing. Both must sit
    // inside the one GestureDetector carrying swipeUp, so the Pan sees
    // touches starting on either. The tap still works: the Pan only
    // activates after 12dp of upward movement.
    const detectorOpen = LAYOUT_SRC.indexOf('<GestureDetector gesture={swipeUp}>');
    expect(detectorOpen).toBeGreaterThan(-1);
    const detectorClose = LAYOUT_SRC.indexOf('</GestureDetector>', detectorOpen);
    expect(detectorClose).toBeGreaterThan(detectorOpen);
    const arrow = LAYOUT_SRC.indexOf('accessibilityLabel="Open categories"');
    expect(arrow).toBeGreaterThan(detectorOpen);
    expect(arrow).toBeLessThan(detectorClose);
    const bar = LAYOUT_SRC.indexOf('style={styles.bar}');
    expect(bar).toBeGreaterThan(detectorOpen);
    expect(bar).toBeLessThan(detectorClose);
    // The arrow still keeps its tap handler (swipe is an addition,
    // not a replacement for the tap).
    expect(LAYOUT_SRC.slice(arrow - 200, arrow)).toContain('onPress');
  });
});
