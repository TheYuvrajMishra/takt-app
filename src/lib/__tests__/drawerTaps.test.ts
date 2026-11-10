// Regression guards for "nothing clickable in any drawer" (2026-11-10).
// Two causes:
// 1. The Sheet's body/header Pans had NO activation threshold, so they
//    activated on the tap's finger jitter and claimed the touch — every
//    button inside a sheet stopped responding.
// 2. A dock pill had NO tap action at all (hold-only by design), so a
//    tap on a pill did nothing and the drawer read as dead.
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import SHEET_SRC from '../../components/Sheet.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TODAY_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CAL_SRC from '../../app/(tabs)/calendar.tsx?raw';

describe('sheet drags do not swallow taps', () => {
  it('bodyPan and headerPan need an activation threshold (taps move <10dp)', () => {
    expect(SHEET_SRC).toContain('.activeOffsetY([-10, 10])');
    // Both Pans carry it.
    const hits = SHEET_SRC.match(/\.activeOffsetY\(\[-10, 10\]\)/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('dock pills respond to a tap', () => {
  it('the node has a fast-failing Tap gesture, Simultaneous with hold/pan', () => {
    expect(DOCK_SRC).toContain('Gesture.Tap()');
    expect(DOCK_SRC).toContain('.maxDuration(250)');
    expect(DOCK_SRC).toContain('.maxDistance(10)');
    expect(DOCK_SRC).toContain('Gesture.Simultaneous(tap, longPress, pan)');
    expect(DOCK_SRC).toContain('onTap?: (category: Category) => void');
  });

  it('both modes wire the tap to a quick-add in the earliest slot', () => {
    expect(TODAY_SRC).toContain('onTap={(category) => createInEarliestSlot(category)}');
    expect(CAL_SRC).toContain('onTap={(category) => dockCreateEarliest(category)}');
  });
});
