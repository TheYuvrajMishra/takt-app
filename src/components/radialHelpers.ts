// Takt — radial-menu pure helpers. The radial's hover math lives here (not
// inside RadialMenu) because the finger is tracked by the dock node's Pan —
// a gesture that mounts mid-touch (the radial itself) can never see the
// ongoing touch, so the dock forwards positions and the parent computes the
// hover from the anchor. See useRadialDrag.
import type { DockAnchor } from './Dock';

/** Radius of the subcategory circle around the held node. */
export const RADIAL_RADIUS = 112;
/** How far the finger may stray from the ring and still count as hovering. */
export const RADIAL_HOVER_BAND = 70;
/** Max angular distance (deg) from a subcategory for the finger to hover it. */
const HOVER_ANGLE_TOLERANCE = 40;
/** Hover this long on one subcategory to arm the drag (no lift, no tap). */
export const RADIAL_HOVER_MS = 300;

/** Clamp the bloom center so the circle stays on screen. */
export function radialCenter(
  anchor: DockAnchor,
  width: number,
  height: number,
): { cx: number; cy: number } {
  return {
    cx: Math.min(Math.max(anchor.x, 96), width - 96),
    cy: Math.min(Math.max(anchor.y, 170), height - 260),
  };
}

/** Angle (deg) of each subcategory around the center, starting at the top. */
export function radialAngles(count: number): number[] {
  return Array.from({ length: count }, (_, i) => -90 + (i * 360) / count);
}

/**
 * Which subcategory the finger is hovering (-1 = none). The finger must be
 * on the ring (within RADIAL_HOVER_BAND of RADIAL_RADIUS) and within
 * HOVER_ANGLE_TOLERANCE of a subcategory's angle.
 */
export function radialHoverIndex(
  cx: number,
  cy: number,
  x: number,
  y: number,
  count: number,
): number {
  if (count <= 0) return -1;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= RADIAL_RADIUS - RADIAL_HOVER_BAND || dist >= RADIAL_RADIUS + RADIAL_HOVER_BAND) {
    return -1;
  }
  const fingerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const angles = radialAngles(count);
  let best = HOVER_ANGLE_TOLERANCE;
  let idx = -1;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i] ?? 0;
    let diff = Math.abs(fingerAngle - a) % 360;
    if (diff > 180) diff = 360 - diff;
    if (diff < best) {
      best = diff;
      idx = i;
    }
  }
  return idx;
}
