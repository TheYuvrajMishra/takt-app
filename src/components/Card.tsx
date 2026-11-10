// Takt — Card. Paper (white) raised card only; cloud is the app background,
// never a card fill (DESIGN.md).
//
// ONE view, one shadow (`shadows.card`): a single large, low-opacity
// ambient. The earlier two nested shells (ambient outer + contact inner)
// drew a dark line just inside the card edge on the same-colour fill and
// read as a glitch — and the nesting broke full-width cards: with the
// caller setting alignItems center, the inner shell shrink-wrapped to its
// content and the hero card rendered at half width (reported 2026-11-10).
// A subtle paper grain sits on top of the fill (translucent, so text
// stays crisp through it).
import type { ReactNode } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, shadows } from '../theme/tokens';
import { PaperTexture } from './PaperTexture';

export interface CardProps {
  children: ReactNode;
  /** Fill color. Defaults to paper. Use a category color for hero cards. */
  color?: string;
  radius?: number;
  style?: ViewStyle;
  /** Makes the card pressable. */
  onPress?: PressableProps['onPress'];
  testID?: string;
}

export function Card({ children, color = colors.paper, radius = radii.card, style, onPress, testID }: CardProps) {
  const shellStyle = { backgroundColor: color, borderRadius: radius };
  const inner = (
    <>
      {children}
      <PaperTexture radius={radius} />
    </>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [styles.card, shellStyle, { opacity: pressed ? 0.92 : 1 }, style]}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[styles.card, shellStyle, style]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadows.card,
    padding: 20,
  },
});
