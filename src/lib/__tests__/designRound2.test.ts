// Regression guards for the 2026-11-10 design round 2 (7 items).
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import CARD_SRC from '../../components/Card.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CAL_SRC from '../../app/(tabs)/calendar.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TODAY_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import LAYOUT_SRC from '../../app/(tabs)/_layout.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TEXTURE_SRC from '../../components/PaperTexture.tsx?raw';

describe('Card is one view, one shadow', () => {
  it('has no nested ambient + contact shells (the inner shadow glitched, and the inner shell shrink-wrapped the hero to half width)', () => {
    expect(CARD_SRC).not.toContain('shadows.ambient');
    expect(CARD_SRC).not.toContain('shadows.contact');
    expect(CARD_SRC).toContain('shadows.card');
    // A single root view/pressable carrying the caller's style (so a
    // width: 100% + alignItems center card really is full width).
    expect(CARD_SRC).toContain('style={[styles.card, shellStyle, style]}');
  });
});

describe('textures differ per surface', () => {
  it('PaperTexture has three kinds with three different tiles', () => {
    expect(TEXTURE_SRC).toContain("kind = 'fine'");
    expect(TEXTURE_SRC).toContain('COARSE_GRAIN_DATA_URI');
    expect(TEXTURE_SRC).toContain('LINEN_DATA_URI');
    expect(TEXTURE_SRC).toContain("coarse: COARSE_GRAIN_DATA_URI");
    expect(TEXTURE_SRC).toContain('linen: LINEN_DATA_URI');
  });
});

describe('smooth pinch zoom', () => {
  it('the pinch writes the shared value only and commits on end — no React state per frame', () => {
    expect(CAL_SRC).toContain('hourHeightSV.value = clamp(pinchBaseH.value * e.scale, MIN_HOUR_H, MAX_HOUR_H)');
    expect(CAL_SRC).toContain('runOnJS(commitZoom)(hourHeightSV.value)');
    // The old per-frame setHourHeight in the pinch is gone.
    expect(CAL_SRC).not.toContain('runOnJS(setHourHeight)');
    // The grid layout reads the shared value (rows, blocks, now-line, container).
    expect(CAL_SRC).toContain('hourHeightSV={hourHeightSV}');
    expect(CAL_SRC).toContain('const gridStyle = useAnimatedStyle(() => ({ height: HOURS * hourHeightSV.value }))');
  });
});

describe('calendar opens on now', () => {
  it('scrolls to now on focus (not a mount-only effect) using the live hour height', () => {
    expect(CAL_SRC).toContain('useFocusEffect(');
    expect(CAL_SRC).toContain('(nowMinutes() / 60 - 1.5) * hourHeightRef.current');
    expect(CAL_SRC).not.toContain('(nowMin / 60 - 1.5) * 64');
    expect(CAL_SRC).not.toContain('didScrollRef');
  });
});

describe('today drop highlight', () => {
  it('never tints Next up or Left while dragging', () => {
    expect(TODAY_SRC).toContain("if (found === 'next' || found === 'left') found = null;");
  });
});

describe('navbar swipe-up covers the arrow', () => {
  it('the swipe-up GestureDetector wraps the arrow and the bar', () => {
    // The detector must open before the barWrap view (so it wraps the
    // arrow Pressable too), not just around the bar.
    const detIdx = LAYOUT_SRC.indexOf('<GestureDetector gesture={swipeUp}>');
    const wrapIdx = LAYOUT_SRC.indexOf('styles.barWrap');
    const arrowIdx = LAYOUT_SRC.indexOf('styles.arrowHit');
    expect(detIdx).toBeGreaterThan(-1);
    expect(wrapIdx).toBeGreaterThan(detIdx);
    expect(arrowIdx).toBeGreaterThan(detIdx);
  });
});

describe('today hero', () => {
  it('renders the mini timeline with the date pill and no separate top clock text', () => {
    expect(TODAY_SRC).toContain('<MiniTimeline blocks={blocks} nowMin={nowMin} />');
    expect(TODAY_SRC).toContain('datePill');
    expect(TODAY_SRC).not.toContain('styles.clock');
    expect(TODAY_SRC).not.toContain('styles.greeting');
    expect(TODAY_SRC).not.toContain('styles.dateLine');
  });
});
