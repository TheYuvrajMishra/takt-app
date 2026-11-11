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
// eslint-disable-next-line import/no-unresolved
import CARD_SRC from '../../components/Card.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('card texture sits behind the buttons', () => {
  it('renders the grain before the children, so it can never cover a button', () => {
    // The hero's Done / Start / Snooze would not tap: the full-card
    // grain rendered last (on top) intercepted the taps despite
    // pointerEvents none. Grain first = tappable by construction.
    const start = CARD_SRC.indexOf('const inner = (');
    expect(start).toBeGreaterThan(-1);
    const inner = CARD_SRC.slice(start);
    expect(inner.indexOf('<PaperTexture')).toBeLessThan(inner.indexOf('{children}'));
  });
});

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

  it('renders the timeline with a red centre marker', () => {
    expect(TIMELINE_SRC).toContain('NOW_RED');
    expect(TIMELINE_SRC).toContain('dayTimelineSegments');
    expect(TIMELINE_SRC).toContain('centerPill');
    expect(TIMELINE_SRC).toContain('centerLine');
    expect(TIMELINE_SRC).toContain('centerDot');
  });

  it('is a zoomed full-day strip, fixed centre marker, dynamic edge times', () => {
    // Zoomed strip (300dp/hour, about one hour per viewport) spanning
    // the whole day so the user can swipe to day end; the red marker is
    // fixed at the viewport centre and the strip slides under it; the
    // only time labels are the visible window's start and end, updating
    // from the scroll offset.
    expect(TIMELINE_SRC).toContain('PX_PER_HOUR = 300');
    expect(TIMELINE_SRC).toContain('DAY_MIN = 24 * 60');
    expect(TIMELINE_SRC).toContain('<ScrollView');
    expect(TIMELINE_SRC).toContain('horizontal');
    expect(TIMELINE_SRC).toContain('centerOnNow');
    expect(TIMELINE_SRC).toContain('nowX - viewportW.current / 2');
    expect(TIMELINE_SRC).toContain('edgeLabels');
    expect(TIMELINE_SRC).toContain('windowStartMin');
    expect(TIMELINE_SRC).toContain('windowEndMin');
    expect(TIMELINE_SRC).toContain("left: '50%'");
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
  it('scrolls to now on focus and on content layout, only when viewing today', () => {
    // The single mount-time scroll never fired (tab screens stay
    // mounted), and the two focus timers could fire before layout, so
    // the grid sat at day start. Now: a scrollToNow that only marks
    // itself done when the scroll actually runs, fired on focus (three
    // passes) and when the content size is first known, with the flag
    // reset on blur so it re-lands every time the tab opens.
    expect(CAL_SRC).toContain('useFocusEffect');
    expect(CAL_SRC).toContain('const scrollToNow = useCallback');
    expect(CAL_SRC).toContain('if (anchorKey !== todayKey) return;');
    expect(CAL_SRC).toContain('(nowMinutes() / 60 - 1.5) * hourHeightRef.current');
    expect(CAL_SRC).toContain('scrolledToNowRef');
    expect(CAL_SRC).toContain('onContentSizeChange');
    expect(CAL_SRC).not.toContain('didScrollRef');
  });
});

describe('day change slides like a page turn', () => {
  it('slides the grid in from the direction of travel on any anchor change', () => {
    expect(CAL_SRC).toContain('dayShiftX = useSharedValue(0)');
    expect(CAL_SRC).toContain('gridShiftStyle');
    expect(CAL_SRC).toContain('transform: [{ translateX: dayShiftX.value }]');
    expect(CAL_SRC).toContain('dayShiftX.value = dir * width;');
    expect(CAL_SRC).toContain("withTiming(0, { duration: 250, easing: DECEL })");
  });

  it('follows the finger on a two-finger swipe, slides out, then steps', () => {
    const start = CAL_SRC.indexOf('const twoFinger = Gesture.Pan()');
    expect(start).toBeGreaterThan(-1);
    const end = CAL_SRC.indexOf('const outerGestures', start);
    const block = CAL_SRC.slice(start, end);
    expect(block).toContain('.onUpdate((e) => {');
    expect(block).toContain('dayShiftX.value = clamp(e.translationX, -width, width);');
    expect(block).toContain('withTiming(-width, { duration: 150, easing: DECEL }');
    expect(block).toContain('withTiming(width, { duration: 150, easing: DECEL }');
    expect(block).toContain('runOnJS(step)(1)');
    expect(block).toContain('runOnJS(step)(-1)');
  });
});
