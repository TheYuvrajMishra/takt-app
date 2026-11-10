// Regression guards for "nothing clickable in any drawer" (2026-11-10).
// The bug survived THREE fixes, so the approach kept changing:
// 1. (v23) The Sheet's body/header Pans had NO threshold, so they
//    activated on the tap's finger jitter and claimed the touch.
// 2. (v25) activeOffsetY guarded the Y axis only; a diagonal tap
//    jitter still activated the Pan.
// 3. (v27) The bodyPan was REMOVED (plain RN ScrollView), but the
//    buttons STILL did not work — the input (native TextInput) worked
//    and the buttons (Pressable, JS responder) did not, so the touch
//    reached the sheet but the responder never delivered the tap.
// 4. (v28) ALL RNGH is removed from the Sheet: no GestureHandlerRootView,
//    no GestureDetector, no Pan. The Sheet is a plain Modal with plain
//    Pressables, closing via backdrop tap or the back button only.
//    Do NOT re-add RNGH or a Pan to the Sheet.
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import SHEET_SRC from '../../components/Sheet.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TODAY_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CAL_SRC from '../../app/(tabs)/calendar.tsx?raw';

describe('the Sheet has no RNGH at all', () => {
  it('no gesture-handler import, no GestureDetector, no Pan, no bodyPan', () => {
    // Match code constructs, not the header comment (which names them
    // to warn against re-adding them).
    expect(SHEET_SRC).not.toContain("from 'react-native-gesture-handler'");
    expect(SHEET_SRC).not.toContain('<GestureDetector');
    expect(SHEET_SRC).not.toContain('<GestureHandlerRootView');
    expect(SHEET_SRC).not.toContain('Gesture.Pan(');
    expect(SHEET_SRC).not.toContain('const bodyPan');
    expect(SHEET_SRC).not.toContain('const headerPan');
  });

  it('the body ScrollView is the plain React Native one', () => {
    expect(SHEET_SRC).toContain("import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';");
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
