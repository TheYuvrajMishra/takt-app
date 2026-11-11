// Takt — Card. Paper (white) raised card only; cloud is the app background,
// never a card fill (DESIGN.md).
//
// ONE view, ONE shadow. The old Card nested two shells with the same fill
// — an outer ambient shadow plus an inner contact shadow — and that is
// what broke the hero: the inner shadow drew a dark line just inside the
// card edge (a glitched look on a same-colour fill), and the caller's
// alignItems: center made the inner shell shrink-wrap to its content,
// rendering the hero at half width. A single view carries the fill, the
// padding, the grain and one balanced shadow, so the caller's width and
// alignment land on the same view and the card is full width. A subtle
// paper grain sits on top of the fill (translucent, so text stays crisp
// through it).
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
  const cardStyle = { backgroundColor: color, borderRadius: radius };
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
        style={({ pressed }) => [
          styles.card,
          cardStyle,
          { opacity: pressed ? 0.92 : 1 },
          style,
        ]}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[styles.card, cardStyle, style]}>
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
