// Takt — Dock. Swipe-up expandable dock of category chips.
//
// Collapsed: a fixed, non-scrolling row of the 5-6 most-used chips
// (reordered by usage, most important at both ends) with a drag handle
// above it. Swipe up on the handle (or tap it) expands into a grid of
// ALL chips; swipe down on the handle or tap outside collapses.
//
// Selection is press-and-hold ONLY (HOLD_MS = 300): a tap or a swipe
// never selects or creates anything. While holding, the chip scales to
// 0.96 and a thin ring fills around its icon over the hold time; a light
// haptic fires at the moment of activation. Moving more than
// HOLD_CANCEL_PX before the hold completes cancels it (treated as a
// scroll). After activation the chip can be dragged onto the timeline
// (Calendar) — or, where the parent provides onLongPress (Today), the
// hold opens the radial subcategory menu instead.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from './TText';
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
import { colors, fonts, hairline, radii } from '../theme/tokens';
import { DECEL, HOLD_CANCEL_PX, HOLD_MS, useAppReducedMotion } from '../theme/motion';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '../types';
import { useDockBottom, useDockExpandedState, useDockHeightReporter } from './layout';

export interface DockAnchor {
  x: number;
  y: number;
}

export interface DockProps {
  categories: Category[];
  /** Hold (no drag) on a node: open the radial menu at the anchor (Today only). */
  onLongPress?: (category: Category, anchor: DockAnchor) => void;
  /** Drag released: category + screen coordinates of the drop. */
  onDrop?: (category: Category, x: number, y: number) => void;
  /** "+" customize button. */
  onCustomize?: () => void;
  /** Positioning of the dock root (the root is absolute-fill, pointerEvents box-none). */
  style?: ViewStyle;
}

/**
 * Usage ordering: most-used categories sit at both ends, least-used in the
 * middle. Built inside-out: start from the least-used item in the middle and
 * wrap increasingly-used items around it, alternating sides.
 */
export function orderDockCategories(categories: Category[]): Category[] {
  const ascending = [...categories].sort(
    (a, b) => (a.usageCount ?? 0) - (b.usageCount ?? 0),
  );
  const out: Category[] = [];
  ascending.forEach((cat, i) => {
    if (i % 2 === 0) out.unshift(cat);
    else out.push(cat);
  });
  return out;
}

/** The 5-6 most-used categories, ordered most-important at both ends. */
export function topDockCategories(categories: Category[], max: number): Category[] {
  const top = [...categories]
    .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    .slice(0, max);
  return orderDockCategories(top);
}

function lightHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Dock({ categories, onLongPress, onDrop, onCustomize, style }: DockProps) {
  const { width } = useWindowDimensions();
  const dockBottom = useDockBottom();
  const reportDockHeight = useDockHeightReporter();
  const [expanded, setDockExpanded] = useDockExpandedState();
  const reducedMotion = useAppReducedMotion();

  // Most-used chips for the collapsed row: 6 on wide screens, 5 on narrow.
  const maxCollapsed = width >= 400 ? 6 : 5;
  const collapsedCats = useMemo(
    () => topDockCategories(categories, maxCollapsed),
    [categories, maxCollapsed],
  );
  const orderedAll = useMemo(() => orderDockCategories(categories), [categories]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragIndex = useSharedValue(-1);
  const [dragged, setDragged] = useState<Category | null>(null);
  // 0 = collapsed, 1 = expanded (animated; drives height + cross-fade).
  const expandProgress = useSharedValue(0);
  const [rowH, setRowH] = useState(0);
  const [gridH, setGridH] = useState(0);
  const rowHRef = useRef(0);
  const gridHRef = useRef(0);

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
  // content above it (collapsed row vs expanded grid).
  useEffect(() => {
    reportDockHeight(expanded ? gridHRef.current : rowHRef.current);
  }, [expanded, rowH, gridH, reportDockHeight]);
  useEffect(() => () => reportDockHeight(0), [reportDockHeight]);

  const animateExpand = useCallback(
    (toExpanded: boolean) => {
      setDockExpanded(toExpanded);
      if (reducedMotion) {
        expandProgress.value = toExpanded ? 1 : 0;
        return;
      }
      expandProgress.value = withTiming(toExpanded ? 1 : 0, {
        duration: 300,
        easing: DECEL,
      });
    },
    [reducedMotion, expandProgress, setDockExpanded],
  );

  // Swipe up on the handle expands, swipe down collapses; tap toggles.
  const handlePan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onEnd((e) => {
      if (!expanded && (e.translationY < -24 || e.velocityY < -400)) {
        runOnJS(animateExpand)(true);
      } else if (expanded && (e.translationY > 24 || e.velocityY > 400)) {
        runOnJS(animateExpand)(false);
      }
    });
  const handleTap = Gesture.Tap().onEnd(() => {
    runOnJS(animateExpand)(!expanded);
  });
  const handleGesture = Gesture.Exclusive(handlePan, handleTap);

  const containerStyle = useAnimatedStyle(() => {
    const row = rowHRef.current;
    const grid = gridHRef.current;
    const h = row + (grid - row) * expandProgress.value;
    return { height: h > 0 ? h : undefined };
  });
  const rowStyle = useAnimatedStyle(() => ({
    opacity: 1 - expandProgress.value,
    transform: [{ translateY: -8 * expandProgress.value }],
  }));
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

  const onRowLayout = (h: number) => {
    if (h > 0 && h !== rowHRef.current) {
      rowHRef.current = h;
      setRowH(h);
    }
  };
  const onGridLayout = (h: number) => {
    if (h > 0 && h !== gridHRef.current) {
      gridHRef.current = h;
      setGridH(h);
    }
  };

  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      {/* Tap outside the expanded grid collapses it. */}
      {expanded ? (
        <Pressable
          style={styles.backdrop}
          onPress={() => animateExpand(false)}
          accessibilityLabel="Close dock"
        />
      ) : null}

      <View style={[styles.dock, { bottom: dockBottom }]} pointerEvents="box-none">
        <Animated.View style={[styles.container, containerStyle]} pointerEvents="box-none">
          <GestureDetector gesture={handleGesture}>
            <View style={styles.handleWrap} accessible accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse dock' : 'Expand dock'}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>

          <View style={styles.body} pointerEvents="box-none">
            <Animated.View
              style={[styles.row, rowStyle]}
              onLayout={(e) => onRowLayout(e.nativeEvent.layout.height)}
              pointerEvents={expanded ? 'none' : 'auto'}
            >
              {collapsedCats.map((category, index) => (
                <DockNode
                  key={category.id}
                  category={category}
                  index={index}
                  dragX={dragX}
                  dragY={dragY}
                  dragIndex={dragIndex}
                  onDragBegin={beginDrag}
                  onDragEnd={endDrag}
                  onDragCancel={cancelDrag}
                  onLongPress={onLongPress}
                />
              ))}
              {onCustomize ? (
                <View style={[styles.node, styles.customize]}>
                  <Text
                    style={styles.customizeLabel}
                    onPress={onCustomize}
                    accessibilityRole="button"
                    accessibilityLabel="Customize dock"
                  >
                    +
                  </Text>
                </View>
              ) : null}
            </Animated.View>

            <Animated.View
              style={[styles.grid, gridStyle]}
              onLayout={(e) => onGridLayout(e.nativeEvent.layout.height)}
              pointerEvents={expanded ? 'auto' : 'none'}
            >
              {orderedAll.map((category, index) => (
                <DockNode
                  key={category.id}
                  category={category}
                  index={index + 100}
                  dragX={dragX}
                  dragY={dragY}
                  dragIndex={dragIndex}
                  onDragBegin={beginDrag}
                  onDragEnd={endDrag}
                  onDragCancel={cancelDrag}
                  onLongPress={onLongPress}
                />
              ))}
              {onCustomize ? (
                <View style={[styles.node, styles.customize]}>
                  <Text
                    style={styles.customizeLabel}
                    onPress={onCustomize}
                    accessibilityRole="button"
                    accessibilityLabel="Customize dock"
                  >
                    +
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          </View>
        </Animated.View>
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
  onDragBegin: (category: Category, index: number, x: number, y: number) => void;
  onDragEnd: (category: Category, x: number, y: number) => void;
  onDragCancel: () => void;
  onLongPress?: (category: Category, anchor: DockAnchor) => void;
}

const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

function DockNode({
  category,
  index,
  dragX,
  dragY,
  dragIndex,
  onDragBegin,
  onDragEnd,
  onDragCancel,
  onLongPress,
}: DockNodeProps) {
  const reducedMotion = useAppReducedMotion();
  // Hold progress 0..1 (fills over HOLD_MS). Shared so the ring and the
  // chip scale animate on the UI thread.
  const holdProgress = useSharedValue(0);

  // What the hold activates, decided on the JS thread (worklets must never
  // branch on or call a captured function directly — see BlockCard).
  const activateHold = useCallback(
    (cat: Category, idx: number, x: number, y: number) => {
      lightHaptic();
      if (onLongPress) onLongPress(cat, { x, y });
      else onDragBegin(cat, idx, x, y);
    },
    [onLongPress, onDragBegin],
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
    .onTouchesDown(() => {
      // Start the hold-progress cue the instant the finger lands.
      if (reducedMotion) holdProgress.value = 1;
      else holdProgress.value = withTiming(1, { duration: HOLD_MS, easing: DECEL });
    })
    .onUpdate((e) => {
      // Moving past the cancel radius before activation aborts the hold
      // (this is a scroll, not a pick-up).
      if (dragIndex.value !== index && Math.hypot(e.translationX, e.translationY) > HOLD_CANCEL_PX) {
        holdProgress.value = withTiming(0, { duration: 100, easing: DECEL });
        return;
      }
      if (dragIndex.value === index) {
        dragX.value = e.absoluteX;
        dragY.value = e.absoluteY;
      }
    })
    .onEnd((e) => {
      if (dragIndex.value === index) {
        runOnJS(onDragEnd)(category, e.absoluteX, e.absoluteY);
      }
    })
    .onFinalize(() => {
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
          <Svg width={36} height={36}>
            <Circle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              stroke={colors.carbon}
              strokeOpacity={0.18}
              strokeWidth={2}
            />
            <AnimatedCircle
              cx={18}
              cy={18}
              r={RING_R}
              fill="none"
              stroke={colors.carbon}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              animatedProps={ringProps}
              transform={`rotate(-90 18 18)`}
            />
          </Svg>
        </Animated.View>
        <CategoryIcon icon={category.icon} color={category.color} size={22} />
        <Text style={styles.label} numberOfLines={1}>
          {category.name}
        </Text>
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
  container: {
    backgroundColor: colors.cloud,
    borderTopWidth: 1,
    borderTopColor: hairline,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.carbon,
    opacity: 0.25,
  },
  body: {
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    flexShrink: 1,
    minWidth: 0,
  },
  ring: {
    position: 'absolute',
    left: 1,
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
  },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, flexShrink: 1 },
  customize: {
    paddingHorizontal: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  customizeLabel: { fontFamily: fonts.semibold, fontSize: 22, color: colors.carbon, lineHeight: 26 },
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
