// Takt — tab layout. Black pill bottom nav (Today / Calendar / Stats).
//
// Motion law (Fix 4): timing ONLY, Easing.bezier(0.22, 1, 0.36, 1),
// ~300ms, NO spring / overshoot / bounce anywhere in the nav. The active
// pill morphs/slides (position + width interpolate together on the UI
// thread); icons cross-fade between outline and filled; labels reveal
// smoothly. Screen transitions are a short cross-fade + subtle 10px
// translate in the direction of travel (custom scene interpolator +
// timing spec). Light haptic on tab change; pressed tab scales to 0.97
// with timing. Reduce-motion falls back to quick fades. Total feedback
// stays under 400ms. Tab screens stay mounted, so each keeps its scroll
// position.
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/TText';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { colors, fonts, radii } from '../../theme/tokens';
import { DECEL, NAV_MS, useAppReducedMotion } from '../../theme/motion';
import { useNavbarHeightReporter } from '../../components/layout';
import { useStore } from '../../store/useStore';

const TAB_LABELS: Record<string, string> = {
  index: 'Today',
  calendar: 'Calendar',
  stats: 'Stats',
};

const TAB_ICONS: Record<string, 'today' | 'calendar' | 'stats'> = {
  index: 'today',
  calendar: 'calendar',
  stats: 'stats',
};

// Screen transition: cross-fade + subtle 10px translate in the direction
// of travel (the built-in 'shift' uses 50px — too far). Timing only.
function forTaktShift({ current }: { current: { progress: Animated.Value } }) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-10, 0, 10],
          }),
        },
      ],
    },
  };
}

function lightHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

// Structural type for the tab bar props (avoids a direct dependency on
// @react-navigation/bottom-tabs, which expo-router nests internally).
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
}

function TabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reportNavbarHeight = useNavbarHeightReporter();
  const reducedMotion = useAppReducedMotion();
  const hapticsEnabled = useStore((s) => s.settings.haptics);
  const layouts = useRef<Array<{ x: number; width: number }>>([]);
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const pillReady = useRef(false);
  const activeIndex = state.index;

  // Morph/slide the active pill to the newly active tab (position + width
  // together). First measure: place it instantly, no animation.
  useEffect(() => {
    const l = layouts.current[activeIndex];
    if (!l) return;
    if (!pillReady.current) {
      pillX.value = l.x;
      pillW.value = l.width;
      pillReady.current = true;
      return;
    }
    if (reducedMotion) {
      pillX.value = l.x;
      pillW.value = l.width;
      return;
    }
    pillX.value = withTiming(l.x, { duration: NAV_MS, easing: DECEL });
    pillW.value = withTiming(l.width, { duration: NAV_MS, easing: DECEL });
  }, [activeIndex, reducedMotion, pillX, pillW]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }));

  return (
    <View style={[styles.barWrap, { bottom: insets.bottom + 12 }]}>
      <View
        style={styles.bar}
        onLayout={(e) => reportNavbarHeight(e.nativeEvent.layout.height)}
      >
        <Reanimated.View style={[styles.pill, pillStyle]} pointerEvents="none" />
        {state.routes.map((route, index) => {
          const isActive = state.index === index;
          const label = TAB_LABELS[route.name] ?? route.name;
          const icon = TAB_ICONS[route.name] ?? 'today';
          return (
            <TabButton
              key={route.key}
              label={label}
              icon={icon}
              isActive={isActive}
              onPress={() => {
                if (hapticsEnabled) lightHaptic();
                navigateToTab(route.key);
              }}
              onLayout={(layout) => {
                layouts.current[index] = layout;
                // The active tab may have been measured before the effect
                // above ran; place the pill as soon as we know it.
                if (index === state.index && !pillReady.current) {
                  pillX.value = layout.x;
                  pillW.value = layout.width;
                  pillReady.current = true;
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

interface TabButtonProps {
  label: string;
  icon: 'today' | 'calendar' | 'stats';
  isActive: boolean;
  onPress: () => void;
  onLayout: (layout: { x: number; width: number }) => void;
}

function TabButton({ label, icon, isActive, onPress, onLayout }: TabButtonProps) {
  const reducedMotion = useAppReducedMotion();
  const pressed = useSharedValue(0);
  const active = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      active.value = isActive ? 1 : 0;
      return;
    }
    active.value = withTiming(isActive ? 1 : 0, { duration: 200, easing: DECEL });
  }, [isActive, reducedMotion, active]);

  // Pressed state: scale to 0.97 with timing (no layout jump).
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.03 * pressed.value }],
  }));
  // Icon swap: outline cross-fades to filled on activation.
  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.92 + 0.08 * active.value }],
  }));
  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - active.value,
  }));
  // Label reveals smoothly: opacity + a small slide.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * active.value,
    transform: [{ translateX: 4 * (1 - active.value) }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = reducedMotion ? 1 : withTiming(1, { duration: 100, easing: DECEL });
      }}
      onPressOut={() => {
        pressed.value = reducedMotion ? 0 : withTiming(0, { duration: 100, easing: DECEL });
      }}
      onLayout={(e) => onLayout(e.nativeEvent.layout)}
    >
      <Reanimated.View style={[styles.tab, pressStyle]}>
        <View style={styles.iconWrap}>
          <Reanimated.View style={[styles.iconLayer, inactiveIconStyle]}>
            <TabGlyph icon={icon} filled={false} />
          </Reanimated.View>
          <Reanimated.View style={[styles.iconLayer, activeIconStyle]}>
            <TabGlyph icon={icon} filled />
          </Reanimated.View>
        </View>
        <Reanimated.View style={labelStyle}>
          <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
        </Reanimated.View>
      </Reanimated.View>
    </Pressable>
  );
}

/** Tab glyphs: 1.75px stroke, rounded caps. Filled = active state. */
function TabGlyph({ icon, filled }: { icon: 'today' | 'calendar' | 'stats'; filled: boolean }) {
  const stroke = filled ? colors.carbon : colors.paper;
  const fill = filled ? colors.carbon : 'none';
  const common = {
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (icon === 'today') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="4.5" fill={fill} {...common} />
        <Line x1="12" y1="2.5" x2="12" y2="5" {...common} />
        <Line x1="12" y1="19" x2="12" y2="21.5" {...common} />
        <Line x1="2.5" y1="12" x2="5" y2="12" {...common} />
        <Line x1="19" y1="12" x2="21.5" y2="12" {...common} />
        <Line x1="5.2" y1="5.2" x2="7" y2="7" {...common} />
        <Line x1="17" y1="17" x2="18.8" y2="18.8" {...common} />
        <Line x1="5.2" y1="18.8" x2="7" y2="17" {...common} />
        <Line x1="17" y1="7" x2="18.8" y2="5.2" {...common} />
      </Svg>
    );
  }
  if (icon === 'calendar') {
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Rect x="4" y="5.5" width="16" height="14.5" rx="2.5" fill={fill} {...common} />
        <Line x1="4" y1="10" x2="20" y2="10" {...common} />
        <Line x1="8.5" y1="3" x2="8.5" y2="7" {...common} />
        <Line x1="15.5" y1="3" x2="15.5" y2="7" {...common} />
      </Svg>
    );
  }
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x="4.5" y="12" width="3.5" height="8" rx="1" fill={fill} {...common} />
      <Rect x="10.25" y="7" width="3.5" height="13" rx="1" fill={fill} {...common} />
      <Rect x="16" y="10" width="3.5" height="10" rx="1" fill={fill} {...common} />
    </Svg>
  );
}

export default function TabsLayout() {
  const reducedMotion = useAppReducedMotion();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Cross-fade + subtle translate (custom interpolator), timing only.
        // Reduce-motion: quick fade instead.
        animation: reducedMotion ? 'fade' : 'shift',
        sceneStyleInterpolator: reducedMotion ? undefined : forTaktShift,
        transitionSpec: reducedMotion
          ? { animation: 'timing', config: { duration: 120 } }
          : {
              animation: 'timing',
              config: { duration: 280, easing: Easing.bezier(0.22, 1, 0.36, 1) },
            },
      }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    padding: 6,
    gap: 4,
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  pill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radii.pill,
  },
  iconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.paper },
  labelActive: { color: colors.carbon, fontFamily: fonts.semibold },
});
