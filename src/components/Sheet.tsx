// Takt — Sheet. Bottom sheet on a Modal: slide-up, backdrop tap to close,
// drag handle with swipe-down-to-dismiss. Content scrolls when tall.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, fonts, hairline, radii, spacing } from '../theme/tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Small scope line under the title, e.g. "Today only". */
  scopeLabel?: string;
  children: ReactNode;
}

export function Sheet({ visible, onClose, title, scopeLabel, children }: SheetProps) {
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow dragging down.
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) {
        runOnJS(onClose)();
      }
      translateY.value = withSpring(0, { damping: 22, stiffness: 260 });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close sheet" />
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.handle} />
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {scopeLabel ? <Text style={styles.scope}>{scopeLabel}</Text> : null}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(10,10,10,0.35)',
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
  handle: {
    alignSelf: 'center',
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
