// Radial guards: the hover math is pure (the dock's Pan drives it — the
// radial mounts mid-touch and can never see the finger), and the radial
// component itself must stay visual-only (no gesture of its own).
import { describe, expect, it } from 'vitest';
import {
  RADIAL_HOVER_MS,
  radialAngles,
  radialCenter,
  radialHoverIndex,
} from '../../components/radialHelpers';

// eslint-disable-next-line import/no-unresolved
import RADIAL_SRC from '../../components/RadialMenu.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';

describe('radialCenter', () => {
  it('clamps the bloom center so the circle stays on screen', () => {
    expect(radialCenter({ x: 50, y: 100 }, 400, 800)).toEqual({ cx: 96, cy: 170 });
    expect(radialCenter({ x: 500, y: 900 }, 400, 800)).toEqual({ cx: 304, cy: 540 });
    expect(radialCenter({ x: 200, y: 400 }, 400, 800)).toEqual({ cx: 200, cy: 400 });
  });
});

describe('radialAngles', () => {
  it('starts at the top and spreads evenly', () => {
    expect(radialAngles(4)).toEqual([-90, 0, 90, 180]);
    expect(radialAngles(1)).toEqual([-90]);
  });
});

describe('radialHoverIndex', () => {
  const cx = 200;
  const cy = 400;
  const R = 112;

  it('hovers the subcategory on the ring at that angle', () => {
    // 4 subcategories: top (0), right (1), bottom (2), left (3).
    expect(radialHoverIndex(cx, cy, cx, cy - R, 4)).toBe(0);
    expect(radialHoverIndex(cx, cy, cx + R, cy, 4)).toBe(1);
    expect(radialHoverIndex(cx, cy, cx, cy + R, 4)).toBe(2);
    expect(radialHoverIndex(cx, cy, cx - R, cy, 4)).toBe(3);
  });

  it('ignores the finger off the ring (too close or too far)', () => {
    expect(radialHoverIndex(cx, cy, cx, cy, 4)).toBe(-1);
    expect(radialHoverIndex(cx, cy, cx, cy - 300, 4)).toBe(-1);
  });

  it('ignores the finger between subcategories', () => {
    // 45° sits between right (0°) and bottom (90°), 45° from each.
    const x = cx + R * Math.cos(Math.PI / 4);
    const y = cy + R * Math.sin(Math.PI / 4);
    expect(radialHoverIndex(cx, cy, x, y, 4)).toBe(-1);
  });

  it('hovers the nearest subcategory within tolerance', () => {
    // 20° is 20° from right (0°) — inside the 40° tolerance.
    const x = cx + R * Math.cos((20 * Math.PI) / 180);
    const y = cy + R * Math.sin((20 * Math.PI) / 180);
    expect(radialHoverIndex(cx, cy, x, y, 4)).toBe(1);
  });

  it('returns -1 with no subcategories', () => {
    expect(radialHoverIndex(cx, cy, cx, cy - R, 0)).toBe(-1);
  });

  it('arms the drag after a 300ms hover (no lift, no tap)', () => {
    expect(RADIAL_HOVER_MS).toBe(300);
  });
});

describe('radial gesture ownership', () => {
  it('RadialMenu is visual-only: no gesture of its own', () => {
    // The old radial mounted a Pan mid-touch, which can never see the
    // finger already down — that is why the flow needed a lift + tap.
    expect(RADIAL_SRC).not.toContain('GestureDetector');
    expect(RADIAL_SRC).not.toContain('Gesture.Pan');
    expect(RADIAL_SRC).not.toContain('onAttach');
  });

  it('the dock forwards the finger while a radial is open', () => {
    expect(DOCK_SRC).toContain('onRadialMove');
    expect(DOCK_SRC).toContain('onRadialRelease');
    expect(DOCK_SRC).toContain('radialNodeIndex');
  });
});
