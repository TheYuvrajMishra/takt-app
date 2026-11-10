// Takt — Sheet. THE one shared bottom sheet for every drawer.
//
// Why this file looks the way it does (read before touching it):
// The buttons in every drawer were dead through v23, v25 AND v27.
// The input (TextInput, native) worked, the buttons (Pressable, JS
// responder) did not — so the touch reached the sheet, but the JS
// responder never delivered the tap. The cause was RNGH: first the
// bodyPan sat above every button (v23/v25 threshold tunings could not
// restore taps), then the remaining GestureHandlerRootView + headerPan
// in the Modal still broke Pressables. So this Sheet has NO RNGH at
// all now: no GestureHandlerRootView, no GestureDetector, no Pan. The
// body is a plain React Native ScrollView, the buttons are plain
// Pressables, the backdrop is a plain Pressable. The sheet closes via
// backdrop tap or the hardware back button ONLY — there is no drag to
// close. Do NOT re-add RNGH or a Pan to this file; that is the
// dead-buttons bug coming back. If drag-to-close is ever wanted again,
// it must be proven on a device that Pressables still fire with it.
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { PaperTexture } from './PaperTexture';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { DECEL, SHEET_MS, useAppReducedMotion } from '../theme/motion';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Small scope line under the title, e.g. "Today only". */
  scopeLabel?: string;
  children: ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Sheet({ visible, onClose, title, scopeLabel, children }: SheetProps) {
  const translateY = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const reducedMotion = useAppReducedMotion();

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
      <View style={styles.root}>
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
          <View style={styles.header}>
            <View style={styles.handle} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {scopeLabel ? <Text style={styles.scope}>{scopeLabel}</Text> : null}
          </View>
          {/* Plain ScrollView, no gesture on it — see the header comment. */}
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
      </View>
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
