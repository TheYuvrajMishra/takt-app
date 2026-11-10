// Takt — RadialMenu. Visual only: press-and-hold a dock node and its
// subcategories bloom in a circle around the anchor (timed bezier bloom,
// no spring). The finger is tracked by the dock node's Pan — a gesture
// that mounts mid-touch can never see the finger already down, so this
// component owns NO gesture; the parent (useRadialDrag) computes the
// hover from the dock's positions and passes highlightedIndex in. The
// root is pointerEvents none so the touch stays with the dock below.
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './TText';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, radii } from '../theme/tokens';
import { DECEL, useAppReducedMotion } from '../theme/motion';
import { CategoryIcon } from './CategoryIcon';
import type { Category, Subcategory } from '../types';
import { RADIAL_RADIUS, radialAngles, radialCenter } from './radialHelpers';
import type { DockAnchor } from './Dock';

export interface RadialMenuProps {
  category: Category;
  /** Screen coordinates of the long-pressed node. */
  anchor: DockAnchor;
  /** Subcategory the finger is hovering (-1 = none). Controlled by the parent. */
  highlightedIndex: number;
}

const ITEM_W = 104;

export function RadialMenu({ category, anchor, highlightedIndex }: RadialMenuProps) {
  const { width, height } = useWindowDimensions();
  const subs = category.subcategories ?? [];
  const { cx, cy } = radialCenter(anchor, width, height);
  const angles = radialAngles(subs.length);

  return (
    <View style={styles.root} pointerEvents="none">
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
            highlighted={highlightedIndex === i}
          />
        ))
      )}
    </View>
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
        { translateX: cx - ITEM_W / 2 + Math.cos(rad) * RADIAL_RADIUS * p },
        { translateY: cy - 19 + Math.sin(rad) * RADIAL_RADIUS * p },
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
