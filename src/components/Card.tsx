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
// alignment land on the same view and the card is full width.
//
// The grain sits BEHIND the content, not on top of it. It used to render
// last (above the fill, above the buttons) with pointerEvents none — but
// the hero's Done / Start / Snooze still would not tap on device, so the
// texture now goes first: it can never cover a button, by construction.
// At 5% opacity over the fill the look is the same; the content stays
// crisp because the grain never sits on the text.
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
  // Grain first (behind the content): it textures the fill, and it can
  // never sit on top of a button. See the header comment.
  const inner = (
    <>
      <PaperTexture radius={radius} />
      {children}
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
