// Regression guard for the on-device crash:
// "com.facebook.jni.CppException: [Worklets] Tried to synchronously call a
// Remote Function. Called 'anonymous' on the UI Runtime."
// BlockCard's gesture callbacks + useAnimatedStyle are worklets (UI runtime).
// The old code reached into the `props` object from inside them
// (runOnJS(props.onDragStart), opacity: props.dragging ...). `props` holds
// functions, so the Worklets runtime treats it as a remote object and any
// access from a worklet throws the moment a block is touched. The fix:
// destructure every value a worklet needs up front, and mirror `dragging`
// into a shared value. This test reads the component source (via Vite's
// ?raw import, so no node:fs types are needed) and fails if anyone
// reintroduces a `props.` access inside the worklet region.
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import SRC from '../../components/calendar/BlockCard.tsx?raw';

function workletRegion(): string {
  const start = SRC.indexOf('const pan = Gesture.Pan()');
  const end = SRC.indexOf('const category = categoryById');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('BlockCard worklet safety', () => {
  it('never accesses props.* inside gesture callbacks or useAnimatedStyle', () => {
    const region = workletRegion();
    const hits = region.match(/props\./g) ?? [];
    expect(hits).toHaveLength(0);
  });

  it('destructures the callbacks a worklet needs at the top of the component', () => {
    for (const name of [
      'onInteractionStart',
      'onInteractionEnd',
      'onDragStart',
      'onDragPreview',
      'onDragEnd',
      'onResizeStart',
      'onResizePreview',
      'onResizeEnd',
      'onLongPressBlock',
      'onTapBlock',
      'onDragCancel',
    ]) {
      expect(SRC).toContain(name);
    }
    expect(SRC).toContain('} = props;');
  });

  it('mirrors dragging into a shared value instead of reading props in useAnimatedStyle', () => {
    expect(SRC).toContain('draggingSV');
    expect(SRC).toContain('draggingSV.value = dragging');
    expect(workletRegion()).toContain('draggingSV.value');
  });
});
