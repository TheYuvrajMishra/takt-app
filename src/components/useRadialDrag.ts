// Takt — radial drag hook. One continuous touch, no lift, no tap:
//
//   press-and-hold a dock node (300ms) -> its subcategories bloom ->
//   slide the finger to one -> hover it 300ms -> the drag arms (ghost
//   follows the finger) -> release to drop it in.
//
// Why a hook and not the radial's own gesture: the radial mounts
// mid-touch, after the hold, and a gesture that mounts mid-touch can
// never see the finger that is already down — that is why the old flow
// needed a lift + tap. The dock node's Pan owns the touch from
// finger-down, so it forwards positions (onRadialMove) and the release
// (onRadialRelease) here; this hook owns the hover / dwell / attach
// state machine and tells the parent what to do. Works in Today and
// Calendar — the parent only supplies what "create" and "drop" mean.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Category } from '../types';
import type { DockAnchor } from './Dock';
import { RADIAL_HOVER_MS, radialCenter, radialHoverIndex } from './radialHelpers';

export interface UseRadialDragOptions {
  /** Release while hovering a subcategory (or a category with no subs). */
  onCreate: (category: Category, subcategoryId: string | undefined, x: number, y: number) => void;
  /** Release after a dwell-armed drag: drop at (x, y). */
  onDrop: (category: Category, subcategoryId: string | undefined, x: number, y: number) => void;
  /** Finger position while an armed drag is moving (ghost + highlight). */
  onDragMove?: (x: number, y: number) => void;
  /** Released on empty space, or the touch was interrupted. */
  onDismiss?: () => void;
}

export interface RadialState {
  category: Category;
  anchor: DockAnchor;
}

export interface AttachedDrag {
  category: Category;
  subcategoryId?: string;
}

export function useRadialDrag(options: UseRadialDragOptions) {
  const { width, height } = useWindowDimensions();
  const optsRef = useRef(options);
  optsRef.current = options;

  const [radial, setRadial] = useState<RadialState | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [attached, setAttached] = useState<AttachedDrag | null>(null);

  const radialRef = useRef<RadialState | null>(null);
  const hoveredRef = useRef(-1);
  const attachedRef = useRef<AttachedDrag | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearDwell, [clearDwell]);

  /** Open the radial for a held category (called from the dock's hold). */
  const openRadial = useCallback(
    (category: Category, anchor: DockAnchor) => {
      clearDwell();
      hoveredRef.current = -1;
      setHoveredIndex(-1);
      attachedRef.current = null;
      setAttached(null);
      lastPosRef.current = { x: anchor.x, y: anchor.y };
      radialRef.current = { category, anchor };
      setRadial({ category, anchor });
    },
    [clearDwell],
  );

  const reset = useCallback(() => {
    clearDwell();
    hoveredRef.current = -1;
    setHoveredIndex(-1);
    attachedRef.current = null;
    setAttached(null);
    radialRef.current = null;
    setRadial(null);
  }, [clearDwell]);

  /** Dismiss without creating (interrupted touch). */
  const abortRadial = useCallback(() => {
    const wasOpen = radialRef.current !== null;
    reset();
    if (wasOpen) optsRef.current.onDismiss?.();
  }, [reset]);

  /** Finger position from the dock node's Pan (it owns the touch). */
  const handleRadialMove = useCallback(
    (x: number, y: number) => {
      lastPosRef.current = { x, y };
      const cur = radialRef.current;
      if (!cur) return;
      // Armed drag: the finger is carrying the subcategory — report the
      // position for the ghost + drop highlight, no more hovering.
      if (attachedRef.current) {
        optsRef.current.onDragMove?.(x, y);
        return;
      }
      const { cx, cy } = radialCenter(cur.anchor, width, height);
      const idx = radialHoverIndex(cx, cy, x, y, cur.category.subcategories?.length ?? 0);
      if (idx === hoveredRef.current) return;
      hoveredRef.current = idx;
      setHoveredIndex(idx);
      clearDwell();
      if (idx >= 0) {
        Haptics.selectionAsync().catch(() => undefined);
        const sub = cur.category.subcategories?.[idx];
        dwellTimerRef.current = setTimeout(() => {
          // Still hovering the same subcategory after RADIAL_HOVER_MS:
          // arm the drag instead of creating immediately.
          if (hoveredRef.current === idx && radialRef.current) {
            const drag: AttachedDrag = { category: cur.category, subcategoryId: sub?.id };
            attachedRef.current = drag;
            setAttached(drag);
          }
        }, RADIAL_HOVER_MS);
      }
    },
    [width, height, clearDwell],
  );

  /** Finger lifted (called from the dock node's Pan onEnd). */
  const handleRadialRelease = useCallback(
    (x?: number, y?: number) => {
      const pos =
        x !== undefined && y !== undefined ? { x, y } : lastPosRef.current;
      const cur = radialRef.current;
      const att = attachedRef.current;
      const idx = hoveredRef.current;
      reset();
      if (!cur) return;
      if (att) {
        optsRef.current.onDrop(att.category, att.subcategoryId, pos.x, pos.y);
        return;
      }
      if (idx >= 0) {
        const sub = cur.category.subcategories?.[idx];
        optsRef.current.onCreate(cur.category, sub?.id, pos.x, pos.y);
        return;
      }
      if ((cur.category.subcategories?.length ?? 0) === 0) {
        optsRef.current.onCreate(cur.category, undefined, pos.x, pos.y);
        return;
      }
      optsRef.current.onDismiss?.();
    },
    [reset],
  );

  return {
    radial,
    hoveredIndex,
    attached,
    openRadial,
    handleRadialMove,
    handleRadialRelease,
    abortRadial,
  };
}
