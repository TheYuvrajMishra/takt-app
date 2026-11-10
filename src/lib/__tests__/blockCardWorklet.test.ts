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
  const start = SRC.indexOf('const hold = Gesture.LongPress()');
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
      'onResizeTopStart',
      'onResizeTopPreview',
      'onResizeTopEnd',
      'onTapBlock',
      'onDragCancel',
    ]) {
      expect(SRC).toContain(name);
    }
    expect(SRC).toContain('} = props;');
  });

  it('drives the lift from a shared value, never from the dragging prop in a worklet', () => {
    // The old code dimmed via `opacity: props.dragging` inside
    // useAnimatedStyle (the crash). The lift now comes from the `lift`
    // shared value, set by the hold gesture on the UI thread.
    expect(SRC).toContain('lift.value');
    expect(workletRegion()).not.toMatch(/props\.dragging/);
    expect(workletRegion()).not.toContain('draggingSV');
  });

  it('arms drags only after the HOLD_MS hold, and the Pan is manual-activation', () => {
    expect(SRC).toContain('HOLD_MS');
    expect(SRC).toContain('.minDuration(HOLD_MS)');
    expect(SRC).toContain('.manualActivation(true)');
  });

  it('composes hold + pan as Simultaneous, tap Exclusive against the pair', () => {
    // Regression (2026-11-10, reported on device): drag and resize did
    // nothing. The old Exclusive(hold, pan, tap) let the LongPress win at
    // 300ms and cancel the Pan, so onTouchesMove never ran. The hold and
    // the Pan must be Simultaneous; the tap sits Exclusive against the
    // pair so a hold never also fires the tap.
    expect(SRC).toContain('Gesture.Exclusive(Gesture.Simultaneous(hold, pan), tap)');
    expect(SRC).not.toContain('Gesture.Exclusive(hold, pan, tap)');
  });

  it('drives top/height from the live hour-height shared value, not state', () => {
    // Smooth pinch (2026-11-10): the old code passed a plain hourHeight
    // number and re-rendered the whole calendar on every pinch frame.
    // The animated style must read hourHeightSV.value for top/height so
    // a pinch re-lays the card on the UI thread.
    expect(SRC).toContain('hourHeightSV: SharedValue<number>');
    expect(SRC).toContain('top: (blockStartMin / 60) * hourHeightSV.value');
    expect(SRC).toContain('height: Math.max(28, (blockDurationMin / 60) * hourHeightSV.value)');
    expect(SRC).toContain('hourHeightSV.value');
    // And the px<->min conversions in the drag/resize worklets read the
    // shared value too (never a stale destructured number).
    expect(SRC).not.toContain('(e.translationY / hourHeight)');
  });
});
