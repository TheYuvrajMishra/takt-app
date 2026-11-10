// Takt — RadialMenu. Press-and-hold a dock node and its subcategories bloom
// in a circle around the anchor (timed bezier bloom, no spring). Swipe to one and release
// to create it in the earliest empty slot; a haptic tick fires per hover.
// No subcategories: long-press + release creates the category directly.
// Keep pressing a selected subcategory and it enters attach/drag mode.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './TText';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, radii } from '../theme/tokens';
import { DECEL, useAppReducedMotion } from '../theme/motion';
import { CategoryIcon } from './CategoryIcon';
import type { Category, Subcategory } from '../types';

export interface RadialMenuProps {
  visible: boolean;
  category: Category;
  /** Screen coordinates of the long-pressed node. */
  anchor: { x: number; y: number };
  onCreate: (category: Category, subcategoryId?: string) => void;
  onAttach: (category: Category, subcategoryId?: string) => void;
  onDismiss: () => void;
  /** Finger position while dragging after an attach (drives the ghost + section highlight). */
  onDragMove?: (x: number, y: number) => void;
  /** Release after an attach: drop the armed category + subcategory in. */
  onDrop?: (category: Category, subcategoryId: string | undefined, x: number, y: number) => void;
}

const RADIUS = 112;
const ITEM_W = 104;
const ATTACH_HOLD_MS = 450;

export function RadialMenu({ visible, category, anchor, onCreate, onAttach, onDismiss, onDragMove, onDrop }: RadialMenuProps) {
  const { width, height } = useWindowDimensions();
  const subs = category.subcategories ?? [];
  const hovered = useSharedValue(-1);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const hoveredRef = useRef(-1);
  const onAttachRef = useRef(onAttach);
  const onDismissRef = useRef(onDismiss);
  onAttachRef.current = onAttach;
  onDismissRef.current = onDismiss;
  // Attach/drag mode: the finger dwelled on a subcategory (ATTACH_HOLD_MS).
  // The drawer closes and the drag arms — the radial's visuals hide but
  // its Pan stays mounted so the drag keeps tracking until release.
  // A shared value (not just state) so the worklet callbacks can see it.
  const attachedSV = useSharedValue(false);
  const [attached, setAttached] = useState(false);
  const attachedSubRef = useRef<string | undefined>(undefined);
  // Shared (not a ref): read from the Pan's onFinalize worklet.
  const droppedSV = useSharedValue(false);

  // Clamp the bloom center so the circle stays on screen.
  const cx = Math.min(Math.max(anchor.x, 96), width - 96);
  const cy = Math.min(Math.max(anchor.y, 170), height - 260);

  const angles = subs.map((_, i) => -90 + (i * 360) / subs.length);

  useEffect(() => {
    if (!visible) {
      hovered.value = -1;
      setHoveredIdx(-1);
      hoveredRef.current = -1;
      attachedSV.value = false;
      setAttached(false);
      attachedSubRef.current = undefined;
      droppedSV.value = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Haptic tick + attach timer when the hovered subcategory changes.
  useEffect(() => {
    if (!visible) return;
    if (hoveredIdx >= 0) {
      Haptics.selectionAsync().catch(() => {});
      const sub = subs[hoveredIdx];
      const timer = setTimeout(() => {
        if (hoveredRef.current === hoveredIdx) {
          // Dwell: arm the drag instead of creating immediately. The
          // parent closes the drawer and shows the drag ghost; this
          // radial hides its visuals but keeps tracking the finger.
          attachedSV.value = true;
          attachedSubRef.current = sub?.id;
          droppedSV.value = false;
          setAttached(true);
          onAttachRef.current(category, sub?.id);
        }
      }, ATTACH_HOLD_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredIdx, visible]);

  const handleHoverChange = (idx: number) => {
    hoveredRef.current = idx;
    setHoveredIdx(idx);
  };

  const handleRelease = (idx: number) => {
    hoveredRef.current = -1;
    setHoveredIdx(-1);
    if (idx >= 0) {
      onCreate(category, subs[idx]?.id);
    } else if (subs.length === 0) {
      onCreate(category);
    } else {
      onDismiss();
    }
  };

  const handleDrop = (x: number, y: number) => {
    droppedSV.value = true;
    const subId = attachedSubRef.current;
    setAttached(false);
    if (onDrop) onDrop(category, subId, x, y);
    else onCreate(category, subId);
  };

  const handleDragMove = (x: number, y: number) => {
    if (onDragMove) onDragMove(x, y);
  };

  const cleanupAttach = () => {
    // Gesture interrupted after an attach (no release): put the menu away.
    attachedSV.value = false;
    attachedSubRef.current = undefined;
    setAttached(false);
    onDismissRef.current();
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (attachedSV.value) {
        // Attached drag: the finger is carrying the subcategory to a
        // drop target — report the position, no more hovering.
        if (onDragMove) runOnJS(handleDragMove)(e.absoluteX, e.absoluteY);
        return;
      }
      const dx = e.absoluteX - cx;
      const dy = e.absoluteY - cy;
      const dist = Math.hypot(dx, dy);
      let idx = -1;
      if (dist > RADIUS - 70 && dist < RADIUS + 70 && subs.length > 0) {
        const fingerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
        let best = 40;
        for (let i = 0; i < subs.length; i++) {
          const a = angles[i] ?? 0;
          let diff = Math.abs(fingerAngle - a) % 360;
          if (diff > 180) diff = 360 - diff;
          if (diff < best) {
            best = diff;
            idx = i;
          }
        }
      }
      if (idx !== hovered.value) {
        hovered.value = idx;
        runOnJS(handleHoverChange)(idx);
      }
    })
    .onEnd((e) => {
      if (attachedSV.value) {
        runOnJS(handleDrop)(e.absoluteX, e.absoluteY);
        return;
      }
      runOnJS(handleRelease)(hovered.value);
    })
    .onFinalize(() => {
      hovered.value = -1;
      if (attachedSV.value && !droppedSV.value) {
        runOnJS(cleanupAttach)();
      }
    });

  if (!visible) return null;

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.root, attached && styles.rootAttached]}>
        {attached ? null : (
          <>
            {/* Center: the held node. */}
            <View style={[styles.center, { left: cx - 30, top: cy - 30 }]}>
              <CategoryIcon icon={category.icon} color={category.color} size={34} />
            </View>
            <Text style={[styles.centerLabel, { left: cx - 60, top: cy + 40 }]} numberOfLines={1}>
              {category.name}
            </Text>

            {subs.length === 0 ? (
              <Text style={[styles.hint, { left: 0, top: cy + 72 }]}>
                Release to add {category.name}
              </Text>
            ) : (
              subs.map((sub, i) => (
                <RadialItem
                  key={sub.id}
                  sub={sub}
                  index={i}
                  angle={angles[i] ?? 0}
                  cx={cx}
                  cy={cy}
                  highlighted={hoveredIdx === i}
                />
              ))
            )}
          </>
        )}
      </View>
    </GestureDetector>
  );
}

interface RadialItemProps {
  sub: Subcategory;
  index: number;
  angle: number;
  cx: number;
  cy: number;
  highlighted: boolean;
}

function RadialItem({ sub, index, angle, cx, cy, highlighted }: RadialItemProps) {
  const progress = useSharedValue(0);
  const reducedMotion = useAppReducedMotion();

  useEffect(() => {
    // Reduced motion: items appear at their final positions instantly,
    // no staggered timed bloom.
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(index * 45, withTiming(1, { duration: 220, easing: DECEL }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, index]);

  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: cx - ITEM_W / 2 + Math.cos(rad) * RADIUS * p },
        { translateY: cy - 19 + Math.sin(rad) * RADIUS * p },
        { scale: 0.4 + 0.6 * p },
      ],
      opacity: p,
    };
  });

  return (
    <Animated.View
      style={[styles.item, style, highlighted && styles.itemHighlighted]}
      pointerEvents="none"
    >
      <Text style={[styles.itemText, highlighted && styles.itemTextHighlighted]} numberOfLines={1}>
        {sub.name}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(10,10,10,0.16)',
    zIndex: 60,
  },
  // Attached drag: visuals hidden, Pan still tracking — the background
  // must go transparent or it dims the sections being dragged over.
  rootAttached: {
    backgroundColor: 'transparent',
  },
  center: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.carbon,
  },
  centerLabel: {
    position: 'absolute',
    width: 120,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.carbon,
  },
  hint: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.carbon,
  },
  item: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ITEM_W,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.carbon,
  },
  itemHighlighted: { backgroundColor: colors.carbon },
  itemText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  itemTextHighlighted: { color: colors.paper },
});
