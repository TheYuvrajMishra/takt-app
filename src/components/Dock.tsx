// Takt — Dock. A drawer of ALL category chips, hidden until called for.
//
// There is no visible strip: the dock vanishes completely and only comes
// up as a drawer — swipe up anywhere on the navbar (or tap the small
// up-arrow above it) opens it; swipe down on the drawer or tap outside
// closes it. The drawer is transparent (no solid panel over the content),
// its pills float on paper chips, and it sits 8dp above the navbar.
//
// Selection is press-and-hold ONLY (HOLD_MS = 300): a tap or a swipe
// never selects or creates anything. While holding, the chip scales to
// 0.96 and a thin ring fills around its icon over the hold time; a light
// haptic fires at the moment of activation. Moving more than
// HOLD_CANCEL_PX before the hold completes cancels it (treated as a
// scroll). The hold closes the drawer first, then: a category with
// subcategories opens the radial menu (Today / Calendar), anything else
// starts a drag onto the timeline (Calendar) or the sections (Today).
//
// The radial is driven by THIS dock's Pan, not by a gesture inside the
// radial: the radial mounts mid-touch, after the hold, and a gesture that
// mounts mid-touch can never see the finger already down (that is why the
// old flow needed a lift + tap). While a radial is open, the node's Pan
// forwards the finger (onRadialMove) and the release (onRadialRelease);
// the parent (useRadialDrag) owns the hover / dwell / attach machine.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { PaperTexture } from './PaperTexture';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import type { SharedValue } from 'react-native-reanimated';
import { colors, fonts, hairline, radii, shadows } from '../theme/tokens';
import { DECEL, HOLD_CANCEL_PX, HOLD_MS, useAppReducedMotion } from '../theme/motion';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '../types';
import { orderDockCategories, RING_GEOMETRY } from './dockHelpers';
import { useDockBottom, useDockExpandedState, useDockHeightReporter, LAYOUT_GAP } from './layout';

export interface DockAnchor {
  x: number;
  y: number;
}

export interface DockProps {
  categories: Category[];
  /** Hold (no drag) on a node: open the radial menu at the anchor. */
  onLongPress?: (category: Category, anchor: DockAnchor) => void;
  /** Drag released: category + screen coordinates of the drop. */
  onDrop?: (category: Category, x: number, y: number) => void;
  /** Finger position while a node is being dragged (drives drop-target highlight). */
  onDragMove?: (x: number, y: number) => void;
  /** A drag that was armed but ended without a drop (interrupted gesture). */
  onDragAbort?: () => void;
  /** Finger position while a radial is open (drives subcategory hover/dwell). */
  onRadialMove?: (x: number, y: number) => void;
  /** Finger lifted while a radial was open: create the hovered subcategory, or drop an armed drag. */
  onRadialRelease?: (x: number, y: number) => void;
  /** Touch interrupted while a radial was open: dismiss, never create. */
  onRadialAbort?: () => void;
  /** Positioning of the dock root (the root is absolute-fill, pointerEvents box-none). */
  style?: ViewStyle;
}

function lightHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Gap between the drawer and the navbar (the layout gap is 16; the drawer sits a little closer). */
const DRAWER_TO_NAV_GAP = 8;

export function Dock({
  categories,
  onLongPress,
  onDrop,
  onDragMove,
  onDragAbort,
  onRadialMove,
  onRadialRelease,
  onRadialAbort,
  style,
}: DockProps) {
  const dockBottom = useDockBottom();
  const reportDockHeight = useDockHeightReporter();
  const [expanded, setDockExpanded] = useDockExpandedState();
  const reducedMotion = useAppReducedMotion();

  const orderedAll = useMemo(() => orderDockCategories(categories), [categories]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragIndex = useSharedValue(-1);
  const [dragged, setDragged] = useState<Category | null>(null);
  // 0 = hidden, 1 = drawer open (animated; drives height + cross-fade).
  const expandProgress = useSharedValue(0);
  const [gridH, setGridH] = useState(0);
  const gridHRef = useRef(0);
  // Measured grid height, mirrored into a shared value for the
  // container-height worklet. Never read a ref inside a worklet: a worklet
  // captures its closure when first installed, so a ref reads its initial
  // value forever (the drawer stayed clipped to one row — 2026-11-10).
  const gridHSV = useSharedValue(0);
  // Index of the node whose radial is open (-1 = none). Set when a hold
  // opens a radial; the node's Pan forwards the finger while it is set.
  const radialNodeIndex = useSharedValue(-1);

  const beginDrag = (category: Category, index: number, x: number, y: number) => {
    setDragged(category);
    dragX.value = x;
    dragY.value = y;
    dragIndex.value = index;
  };
  const endDrag = (category: Category, x: number, y: number) => {
    setDragged(null);
    dragIndex.value = -1;
    onDrop?.(category, x, y);
  };
  const cancelDrag = () => {
    setDragged(null);
    dragIndex.value = -1;
  };

  // Report the dock's rendered height so the layout contract can keep
  // content above it (0 while hidden — the strip is gone).
  useEffect(() => {
    reportDockHeight(expanded ? gridHRef.current : 0);
  }, [expanded, gridH, reportDockHeight]);
  useEffect(() => () => reportDockHeight(0), [reportDockHeight]);

  const animateExpand = useCallback(
    (toExpanded: boolean) => {
      setDockExpanded(toExpanded);
    },
    [setDockExpanded],
  );

  // Single source of truth: expandProgress follows the context state, so
  // any caller (the navbar's swipe-up, the drawer's swipe-down, a parent
  // collapsing the drawer when a drag starts) animates the same way.
  useEffect(() => {
    if (reducedMotion) {
      expandProgress.value = expanded ? 1 : 0;
      return;
    }
    expandProgress.value = withTiming(expanded ? 1 : 0, {
      duration: 300,
      easing: DECEL,
    });
  }, [expanded, reducedMotion, expandProgress]);

  // Swipe down on the drawer closes it. It runs simultaneous with the
  // node Pans (a swipe starting on a pill would otherwise be stolen by
  // the node's Pan) but only collapses when no drag or radial is active.
  const closePan = Gesture.Pan()
    .activeOffsetY(16)
    .onEnd((e) => {
      if (expandProgress.value < 0.5) return;
      if (dragIndex.value !== -1 || radialNodeIndex.value !== -1) return;
      if (e.translationY > 24 || e.velocityY > 400) {
        runOnJS(animateExpand)(false);
      }
    });

  const containerStyle = useAnimatedStyle(() => {
    // Shared value only — never a ref (see the note above).
    const h = gridHSV.value * expandProgress.value;
    return { height: Math.max(0, h) };
  });
  const gridStyle = useAnimatedStyle(() => ({
    opacity: expandProgress.value,
    transform: [{ translateY: 16 * (1 - expandProgress.value) }],
  }));

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value - 56 },
      { translateY: dragY.value - 28 },
      { scale: 1.1 },
    ],
  }));

  const onGridLayout = (h: number) => {
    if (h > 0 && h !== gridHRef.current) {
      gridHRef.current = h;
      gridHSV.value = h;
      setGridH(h);
    }
  };

  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      {/* Tap outside the drawer collapses it. */}
      {expanded ? (
        <Pressable
          style={styles.backdrop}
          onPress={() => animateExpand(false)}
          accessibilityLabel="Close dock"
        />
      ) : null}

      {/* The drawer sits DRAWER_TO_NAV_GAP above the navbar (dockBottom is
          navbar + LAYOUT_GAP, so subtract the difference). */}
      <View style={[styles.dock, { bottom: Math.max(0, dockBottom - LAYOUT_GAP + DRAWER_TO_NAV_GAP) }]} pointerEvents="box-none">
        <GestureDetector gesture={closePan}>
          <Animated.View
            style={[styles.container, containerStyle]}
            pointerEvents={expanded ? 'auto' : 'none'}
          >
            <Animated.View
              style={[styles.grid, gridStyle]}
              onLayout={(e) => onGridLayout(e.nativeEvent.layout.height)}
            >
              {orderedAll.map((category, index) => (
                <DockNode
                  key={category.id}
                  category={category}
                  index={index}
                  dragX={dragX}
                  dragY={dragY}
                  dragIndex={dragIndex}
                  radialNodeIndex={radialNodeIndex}
                  closePan={closePan}
                  onDragBegin={beginDrag}
                  onDragEnd={endDrag}
                  onDragCancel={cancelDrag}
                  onDragMove={onDragMove}
                  onDragAbort={onDragAbort}
                  onRadialMove={onRadialMove}
                  onRadialRelease={onRadialRelease}
                  onRadialAbort={onRadialAbort}
                  onLongPress={onLongPress}
                  collapseDrawer={() => animateExpand(false)}
                />
              ))}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Drag ghost: follows the finger above the dock. */}
      {dragged ? (
        <Animated.View style={[styles.ghost, ghostStyle]} pointerEvents="none">
          <CategoryIcon icon={dragged.icon} color={dragged.color} size={24} />
          <Text style={styles.ghostLabel}>{dragged.name}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

interface DockNodeProps {
  category: Category;
  index: number;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  dragIndex: SharedValue<number>;
  radialNodeIndex: SharedValue<number>;
  closePan: ReturnType<typeof Gesture.Pan>;
  onDragBegin: (category: Category, index: number, x: number, y: number) => void;
  onDragEnd: (category: Category, x: number, y: number) => void;
  onDragCancel: () => void;
  onDragMove?: (x: number, y: number) => void;
  onDragAbort?: () => void;
  onRadialMove?: (x: number, y: number) => void;
  onRadialRelease?: (x: number, y: number) => void;
  onRadialAbort?: () => void;
  onLongPress?: (category: Category, anchor: DockAnchor) => void;
  /** Close the drawer (called when a hold starts a drag or a radial). */
  collapseDrawer: () => void;
}

const RING_R = RING_GEOMETRY.ringRadius;
const RING_C = 2 * Math.PI * RING_R;

function DockNode({
  category,
  index,
  dragX,
  dragY,
  dragIndex,
  radialNodeIndex,
  closePan,
  onDragBegin,
  onDragEnd,
  onDragCancel,
  onDragMove,
  onDragAbort,
  onRadialMove,
  onRadialRelease,
  onRadialAbort,
  onLongPress,
  collapseDrawer,
}: DockNodeProps) {
  const reducedMotion = useAppReducedMotion();
  // Hold progress 0..1 (fills over HOLD_MS). Shared so the ring and the
  // chip scale animate on the UI thread.
  const holdProgress = useSharedValue(0);
  // True once the Pan's onEnd ran for this touch: onFinalize must not
  // report an abort after a normal drop.
  const endedNormally = useSharedValue(false);

  // What the hold activates, decided on the JS thread (worklets must never
  // branch on or call a captured function directly — see BlockCard).
  // The drawer closes first, whatever the hold becomes: a drag starts
  // from a clear screen, and the radial never sits on top of it.
  const activateHold = useCallback(
    (cat: Category, idx: number, x: number, y: number) => {
      lightHaptic();
      collapseDrawer();
      const hasSubs = (cat.subcategories?.length ?? 0) > 0;
      if (onLongPress && hasSubs) {
        // The radial opens for this node: this node's Pan keeps tracking
        // the finger and forwards it (onRadialMove) until release.
        radialNodeIndex.value = idx;
        onLongPress(cat, { x, y });
      } else {
        onDragBegin(cat, idx, x, y);
      }
    },
    [onLongPress, onDragBegin, collapseDrawer, radialNodeIndex],
  );

  // Arm the drag (or open the radial) once the hold completes. The long
  // press fires only if the finger stayed within HOLD_CANCEL_PX.
  const longPress = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(HOLD_CANCEL_PX)
    .onStart((e) => {
      runOnJS(activateHold)(category, index, e.absoluteX, e.absoluteY);
    });

  const pan = Gesture.Pan()
    .simultaneousWithExternalGesture(closePan)
    .onTouchesDown(() => {
      endedNormally.value = false;
      // Start the hold-progress cue the instant the finger lands.
      if (reducedMotion) holdProgress.value = 1;
      else holdProgress.value = withTiming(1, { duration: HOLD_MS, easing: DECEL });
    })
    .onUpdate((e) => {
      // Radial open for this node: forward the finger for subcategory
      // hover/dwell — never cancel, the slide IS the interaction.
      if (radialNodeIndex.value === index) {
        if (onRadialMove) runOnJS(onRadialMove)(e.absoluteX, e.absoluteY);
        return;
      }
      // Moving past the cancel radius before activation aborts the hold
      // (this is a scroll, not a pick-up).
      if (dragIndex.value !== index && Math.hypot(e.translationX, e.translationY) > HOLD_CANCEL_PX) {
        holdProgress.value = withTiming(0, { duration: 100, easing: DECEL });
        return;
      }
      if (dragIndex.value === index) {
        dragX.value = e.absoluteX;
        dragY.value = e.absoluteY;
        if (onDragMove) runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
      }
    })
    .onEnd((e) => {
      if (radialNodeIndex.value === index) {
        endedNormally.value = true;
        radialNodeIndex.value = -1;
        if (onRadialRelease) runOnJS(onRadialRelease)(e.absoluteX, e.absoluteY);
        return;
      }
      if (dragIndex.value === index) {
        endedNormally.value = true;
        runOnJS(onDragEnd)(category, e.absoluteX, e.absoluteY);
      }
    })
    .onFinalize(() => {
      if (radialNodeIndex.value === index) {
        // Touch interrupted while the radial was open: dismiss, never create.
        radialNodeIndex.value = -1;
        if (onRadialAbort) runOnJS(onRadialAbort)();
      }
      if (dragIndex.value === index && !endedNormally.value) {
        // Armed drag interrupted before a release: tell the parent so it
        // can clear its drop highlight.
        if (onDragAbort) runOnJS(onDragAbort)();
      }
      if (dragIndex.value !== index) {
        holdProgress.value = withTiming(0, { duration: 100, easing: DECEL });
      }
      runOnJS(onDragCancel)();
    });

  const gesture = Gesture.Simultaneous(longPress, pan);

  // Magnify on proximity to the dragged node (by index distance).
  // Timing only — no spring anywhere (see theme/motion).
  const nodeStyle = useAnimatedStyle(() => {
    const d = dragIndex.value;
    const target =
      d === -1 ? 1 : d === index ? 1.3 : Math.abs(d - index) === 1 ? 1.12 : 1;
    const holdScale = 1 - 0.04 * holdProgress.value;
    const scale = target * holdScale;
    if (reducedMotion) return { transform: [{ scale }] };
    return { transform: [{ scale: withTiming(scale, { duration: 200, easing: DECEL }) }] };
  });

  // Thin ring around the icon, filling over the hold time.
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - holdProgress.value),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: holdProgress.value > 0 ? 1 : 0,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.node, nodeStyle]}>
        <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none">
          <Svg width={RING_GEOMETRY.ringSize} height={RING_GEOMETRY.ringSize}>
            <Circle
              cx={RING_GEOMETRY.ringSize / 2}
              cy={RING_GEOMETRY.ringSize / 2}
              r={RING_R}
              fill="none"
              stroke={colors.carbon}
              strokeOpacity={0.18}
              strokeWidth={2}
            />
            <AnimatedCircle
              cx={RING_GEOMETRY.ringSize / 2}
              cy={RING_GEOMETRY.ringSize / 2}
              r={RING_R}
              fill="none"
              stroke={colors.carbon}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              animatedProps={ringProps}
              transform={`rotate(-90 ${RING_GEOMETRY.ringSize / 2} ${RING_GEOMETRY.ringSize / 2})`}
            />
          </Svg>
        </Animated.View>
        <CategoryIcon icon={category.icon} color={category.color} size={22} />
        <Text style={styles.label} numberOfLines={1}>
          {category.name}
        </Text>
        {/* Buttons get the coarse grain, not the fine card grain. */}
        <PaperTexture kind="coarse" radius={radii.pill} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    zIndex: 50,
  },
  backdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  dock: {
    position: 'absolute', left: 0, right: 0,
  },
  // Transparent: no solid panel over the content below — the pills float.
  container: {
    overflow: 'hidden',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Center-aligned: every wrapped row of pills is centered, not
    // left-flushed (reported 2026-11-10).
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: hairline,
    ...shadows.soft,
    flexShrink: 1,
    minWidth: 0,
  },
  ring: {
    position: 'absolute',
    left: RING_GEOMETRY.ringLeft,
    top: RING_GEOMETRY.ringTop,
    width: RING_GEOMETRY.ringSize,
    height: RING_GEOMETRY.ringSize,
  },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, flexShrink: 1 },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  ghostLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paper },
});
