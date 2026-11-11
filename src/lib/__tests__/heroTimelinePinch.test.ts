// Guards for the fresh 2026-11-11 batch (all written on the current
// v21-based code, no reuse of the old design-round-2 implementation):
// (1) only Now / Done tint while dragging in, (2) the hero carries the
// mini timeline and the timing lives inside the card, (3) the pinch
// writes a shared value only, (4) the calendar lands on now on focus.
// eslint-disable-next-line import/no-unresolved
import INDEX_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CAL_SRC from '../../app/(tabs)/calendar.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TIMELINE_SRC from '../../components/MiniTimeline.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import BLOCKCARD_SRC from '../../components/calendar/BlockCard.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('drop highlight: only Now and Done tint', () => {
  it('never tints Next up or Left while dragging in', () => {
    // The drop always creates in the earliest empty slot, so tinting
    // Next up / Left promised a placement the drop never makes.
    expect(INDEX_SRC).toContain(
      "const tintable = found === 'now' || found === 'done' ? found : null;",
    );
  });
});

describe('hero carries the mini timeline', () => {
  it('has no greeting/clock text above the card', () => {
    expect(INDEX_SRC).not.toContain('styles.greeting');
    expect(INDEX_SRC).not.toContain('greetingFor(');
    expect(INDEX_SRC).not.toContain('styles.clock');
  });

  it('writes the timing inside the card: date pill, hours line, timeline', () => {
    expect(INDEX_SRC).toContain('MiniTimeline');
    expect(INDEX_SRC).toContain('styles.datePill');
    expect(INDEX_SRC).toContain('styles.hoursLine');
    expect(INDEX_SRC).toContain('fmtHoursMin(doneMin)');
  });

  it('renders the timeline with a red now-marker', () => {
    expect(TIMELINE_SRC).toContain('NOW_RED');
    expect(TIMELINE_SRC).toContain('dayTimelineSegments');
    expect(TIMELINE_SRC).toContain('timelinePct');
    expect(TIMELINE_SRC).toContain('nowPill');
    expect(TIMELINE_SRC).toContain('nowLine');
    expect(TIMELINE_SRC).toContain('nowDot');
  });
});

describe('smooth pinch: shared value only, no setState per frame', () => {
  it('drives the pinch from a shared value and commits on end', () => {
    const start = CAL_SRC.indexOf('const pinch = Gesture.Pinch()');
    expect(start).toBeGreaterThan(-1);
    const end = CAL_SRC.indexOf('});', start);
    const block = CAL_SRC.slice(start, end);
    expect(block).toContain('hourHeightSV.value = clamp(');
    expect(block).not.toContain('runOnJS(setHourHeight)');
    expect(block).toContain('runOnJS(commitZoom)(hourHeightSV.value)');
  });

  it('reads the live hour height in the grid, not state', () => {
    expect(CAL_SRC).toContain('hourHeightSV = useSharedValue');
    expect(CAL_SRC).toContain('<HourRow key={h} hourHeightSV={hourHeightSV} h={h} />');
    expect(CAL_SRC).toContain('hourHeightSV={hourHeightSV}');
    expect(BLOCKCARD_SRC).toContain('hourHeightSV: SharedValue<number>');
    expect(BLOCKCARD_SRC).toContain('top: (blockStartMin / 60) * hourHeightSV.value');
    expect(BLOCKCARD_SRC).not.toContain('hourHeight: number;');
  });
});

describe('calendar lands on now when opened', () => {
  it('scrolls to now on focus, only when viewing today', () => {
    expect(CAL_SRC).toContain('useFocusEffect');
    expect(CAL_SRC).toContain('if (anchorKey !== todayKey) return;');
    expect(CAL_SRC).toContain('(nowMinutes() / 60 - 1.5) * hourHeightRef.current');
    expect(CAL_SRC).not.toContain('didScrollRef');
  });
});
