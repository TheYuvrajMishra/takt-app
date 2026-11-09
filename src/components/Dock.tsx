// Takt — Dock. Bottom draggable node dock: pill chips with icon + label for
// every category, usage-ordered with the most-used categories at both ends.
// Drag a node: a ghost follows the finger and nearby nodes magnify.
// Long-press a node: the parent opens the RadialMenu at the anchor point.
import { useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { colors, fonts, hairline, radii } from '../theme/tokens';
import { useAppReducedMotion } from '../theme/motion';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '../types';

export interface DockAnchor {
  x: number;
  y: number;
}

export interface DockProps {
  categories: Category[];
  /** Long-press on a node: open the radial menu at the anchor. */
  onLongPress?: (category: Category, anchor: DockAnchor) => void;
  /** Drag released: category + screen coordinates of the drop. */
  onDrop?: (category: Category, x: number, y: number) => void;
  /** "+" customize button. */
  onCustomize?: () => void;
  /** Positioning of the dock row (the root is absolute-fill, pointerEvents box-none). */
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

export function Dock({ categories, onLongPress, onDrop, onCustomize, style }: DockProps) {
  const ordered = useMemo(() => orderDockCategories(categories), [categories]);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragIndex = useSharedValue(-1);
  const [dragged, setDragged] = useState<Category | null>(null);

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

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value - 56 },
      { translateY: dragY.value - 28 },
      { scale: 1.1 },
    ],
  }));

  return (
    <View style={[styles.root, style]} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroller}
      >
        {ordered.map((category, index) => (
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
      </ScrollView>

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
  const longPress = Gesture.LongPress()
    .minDuration(380)
    .onStart((e) => {
      if (onLongPress) {
        runOnJS(onLongPress)(category, { x: e.absoluteX, y: e.absoluteY });
      }
    });

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .activeOffsetY([-8, 8])
    .onBegin((e) => {
      runOnJS(onDragBegin)(category, index, e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
    })
    .onEnd((e) => {
      runOnJS(onDragEnd)(category, e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      runOnJS(onDragCancel)();
    });

  const gesture = Gesture.Race(longPress, pan);

  // Magnify on proximity to the dragged node (by index distance).
  // Reduced motion: apply the target scale directly, no spring.
  const nodeStyle = useAnimatedStyle(() => {
    const d = dragIndex.value;
    const target = d === -1 ? 1 : d === index ? 1.3 : Math.abs(d - index) === 1 ? 1.12 : 1;
    if (reducedMotion) return { transform: [{ scale: target }] };
    return { transform: [{ scale: withSpring(target, { damping: 16, stiffness: 300 }) }] };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.node, nodeStyle]}>
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
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  scroller: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  customize: {
    paddingHorizontal: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
