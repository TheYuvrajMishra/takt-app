// Takt — Sheet. THE one shared bottom sheet for every drawer.
//
// Why this exists: a gesture inside an RN Modal only works when the
// Modal's content is wrapped in GestureHandlerRootView — without it the
// drag handle silently does nothing on Android (every drawer had a
// handle you could not drag). This component owns that wrapper, so no
// drawer ever re-implements it.
//
// Behaviour (restored 2026-11-10 — see below):
// - Handle + header are draggable (the ONLY drag in the sheet) and drag
//   DOWN to close; backdrop tap and the hardware back button close.
// - The body is a PLAIN React Native ScrollView with NO gesture on it.
//   That is deliberate, and it is the fix for the dead-buttons bug:
//   the body used to be wrapped in a GestureDetector carrying a Pan
//   (drag down at the top to close). That Pan sat above every button,
//   and RNGH intercepts touches at the native level for the whole
//   subtree — two threshold tunings (v23 activeOffsetY, v25 minDistance)
//   did NOT restore taps. Thresholds assume the Pan cleanly releases a
//   sub-threshold touch to the responder; it does not. So the Pan is
//   gone from the body entirely: the buttons are plain Pressables in a
//   plain ScrollView, and nothing above them can claim the touch.
//   The trade is that the body no longer drags the sheet down — the
//   header drag + backdrop + back button close it. Do NOT re-add a Pan
//   over the body; that is the bug coming back.
//
// History: v29 removed ALL RNGH from this file (including the header
// drag) after the buttons were still reported dead on v27 — but the
// v27 report came ~5 minutes after v27 published, so it was almost
// certainly still the old build. The user then asked for drag-to-close
// back, so the header drag is restored here (this file is the v27
// Sheet, with the header drag intact). The body Pan stays removed.
// What design round 2 (v22) actually changed in this file: only the
// linen PaperTexture (pointerEvents none) — it did not break the drag
// or the buttons; the dead-buttons bug predates v22 (reported on v21).
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { PaperTexture } from './PaperTexture';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
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
  const reducedMotion = useAppReducedMotion();
  const close = onClose;
  const snaps = snapPoints;

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

  // The header drag is the sheet's only drag. It needs a threshold:
  // without one the Pan activates on the finger's first jitter. It must
  // be minDistance (BOTH axes): a Y-only threshold leaves the X axis
  // open to a diagonal tap jitter. The header holds no buttons, so this
  // Pan can never swallow one — that is why it is allowed to stay.
  const headerPan = Gesture.Pan()
    .minDistance(10)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      settle(e.translationY, e.velocityY);
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
          {/* The body is a plain ScrollView with NO GestureDetector on
              it — see the header comment. Any Pan here is the dead-
              buttons bug coming back. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {/* Sheets get the linen weave, not the card grain. */}
          <PaperTexture kind="linen" radius={radii.sheet} />
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
