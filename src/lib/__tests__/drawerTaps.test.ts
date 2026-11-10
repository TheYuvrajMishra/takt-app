// Regression guards for "nothing clickable in any drawer" (2026-11-10).
// The bug survived TWO threshold tunings, so the approach changed:
// thresholds assume a Pan cleanly releases a sub-threshold touch to the
// responder; it does not. The structural fix is that NO Pan sits over
// the sheet body at all — the body is a plain RN ScrollView, and the
// only drag in the sheet is the header Pan (which holds no buttons).
// History:
// 1. (v23) The Sheet's body/header Pans had NO threshold, so they
//    activated on the tap's finger jitter and claimed the touch.
// 2. (v25) activeOffsetY guarded the Y axis only; a diagonal tap
//    jitter still activated the Pan.
// 3. (v26) The bodyPan is REMOVED. No threshold, no Pan over buttons.
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import SHEET_SRC from '../../components/Sheet.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TODAY_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CAL_SRC from '../../app/(tabs)/calendar.tsx?raw';

describe('no Pan sits over the sheet body', () => {
  it('there is no bodyPan at all', () => {
    expect(SHEET_SRC).not.toContain('bodyPan');
    expect(SHEET_SRC).not.toContain('simultaneousWithExternalGesture');
  });

  it('the body ScrollView is the plain React Native one, not gesture-handler', () => {
    expect(SHEET_SRC).toContain("import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';");
    expect(SHEET_SRC).not.toContain("ScrollView,\n} from 'react-native-gesture-handler';");
  });

  it('the only GestureDetector in the sheet wraps the header, never the body', () => {
    const detectors = SHEET_SRC.match(/<GestureDetector/g) ?? [];
    expect(detectors.length).toBe(1);
    expect(SHEET_SRC).toContain('<GestureDetector gesture={headerPan}>');
  });

  it('the header Pan (no buttons under it) still has a both-axes threshold', () => {
    expect(SHEET_SRC).toContain('.minDistance(10)');
  });

  it('the dock closePan is guarded on both axes too', () => {
    expect(DOCK_SRC).toContain('.minDistance(10)');
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
