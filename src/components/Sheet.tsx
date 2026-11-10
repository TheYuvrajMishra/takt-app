// Takt — Sheet. THE one shared bottom sheet for every drawer.
//
// Why this exists: a gesture inside an RN Modal only works when the
// Modal's content is wrapped in GestureHandlerRootView — without it the
// drag handle silently does nothing on Android (every drawer had a
// handle you could not drag). This component owns that wrapper, so no
// drawer ever re-implements it.
//
// Behaviour:
// - Handle + header are always draggable; the body scrolls, and a body
//   drag only moves the sheet when the inner scroll is at the top.
// - Release past ~30% of the sheet height OR with downward velocity
//   >~800px/s closes (timing 240ms, same bezier, no bounce); otherwise
//   it settles back (or to the nearest snap point, when given).
// - Backdrop fades with the drag; backdrop tap and the hardware back
//   button close.
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, hairline, radii, spacing } from '../theme/tokens';
import { DECEL, SHEET_MS, useAppReducedMotion } from '../theme/motion';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Small scope line under the title, e.g. "Today only". */
  scopeLabel?: string;
  /** Snap fractions of the sheet height, e.g. [0.5, 1]. Default: full only. */
  snapPoints?: number[];
  children: ReactNode;
}

/** Close once the sheet is dragged past this fraction of its height. */
const CLOSE_FRACTION = 0.3;
/** Or flung down faster than this (px/s). */
const CLOSE_VELOCITY = 800;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Sheet({ visible, onClose, title, scopeLabel, snapPoints, children }: SheetProps) {
  const translateY = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const reducedMotion = useAppReducedMotion();
  const close = onClose;
  const snaps = snapPoints;
  // Lets the sheet-drag Pan run at the same time as the body's native
  // scroll gesture; the scrollY check below decides which one wins.
  // (Untyped on purpose: gesture-handler's external-gesture ref accepts
  // the native view ref, whose exact type varies by RN version.)
  const scrollViewRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Slide up on open; reset when closed.
  useEffect(() => {
    if (!visible) return;
    const from = sheetH.value > 0 ? sheetH.value : 600;
    translateY.value = from;
    if (reducedMotion) {
      translateY.value = 0;
      return;
    }
    translateY.value = withTiming(0, { duration: SHEET_MS, easing: DECEL });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const settle = (y: number, velocityY: number) => {
    'worklet';
    const h = sheetH.value;
    if (h <= 0) return;
    const pastThreshold = y > CLOSE_FRACTION * h;
    const flung = velocityY > CLOSE_VELOCITY;
    if (pastThreshold || flung) {
      if (reducedMotion) {
        translateY.value = h;
        runOnJS(close)();
        return;
      }
      translateY.value = withTiming(
        h,
        { duration: SHEET_MS, easing: DECEL },
        (finished) => {
          if (finished) runOnJS(close)();
        },
      );
      return;
    }
    // Settle back — to the nearest snap point when given, else fully open.
    let target = 0;
    if (snaps && snaps.length > 0) {
      const candidates = snaps.map((f) => h * (1 - f));
      candidates.push(0);
      let best = 0;
      let bestDist = Infinity;
      for (const c of candidates) {
        const d = Math.abs(y - c);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      target = best;
    }
    if (reducedMotion) {
      translateY.value = target;
      return;
    }
    translateY.value = withTiming(target, { duration: SHEET_MS, easing: DECEL });
  };

  const headerPan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      settle(e.translationY, e.velocityY);
    });

  // Body drag coexists with the inner ScrollView: it only moves the sheet
  // while the scroll is pinned at the top.
  const bodyPan = Gesture.Pan()
    .simultaneousWithExternalGesture(scrollViewRef)
    .onUpdate((e) => {
      if (scrollY.value <= 0) {
        translateY.value = Math.max(0, e.translationY);
      }
    })
    .onEnd((e) => {
      if (scrollY.value <= 0) {
        settle(e.translationY, e.velocityY);
      } else {
        translateY.value = withTiming(0, { duration: SHEET_MS, easing: DECEL });
      }
    });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    const h = sheetH.value > 0 ? sheetH.value : 600;
    const p = Math.max(0, Math.min(1, 1 - translateY.value / h));
    return { opacity: 0.35 * p };
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <AnimatedPressable
          style={[styles.backdrop, backdropStyle]}
          onPress={onClose}
          accessibilityLabel="Close sheet"
        />
        <Animated.View
          style={[styles.sheet, sheetStyle]}
          onLayout={(e) => {
            sheetH.value = e.nativeEvent.layout.height;
          }}
        >
          <GestureDetector gesture={headerPan}>
            <View style={styles.header}>
              <View style={styles.handle} />
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {scopeLabel ? <Text style={styles.scope}>{scopeLabel}</Text> : null}
            </View>
          </GestureDetector>
          <GestureDetector gesture={bodyPan}>
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {children}
            </ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: colors.carbon,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '82%',
  },
  header: { alignItems: 'center' },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.carbon,
    opacity: 0.2,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.carbon,
    textAlign: 'center',
  },
  scope: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.carbon,
    opacity: 0.55,
    textAlign: 'center',
    marginTop: 4,
  },
  content: { paddingTop: spacing.md },
});
