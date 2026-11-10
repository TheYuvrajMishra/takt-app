// Takt — Card. Paper (white) raised card only; cloud is the app background,
// never a card fill (DESIGN.md).
//
// Realistic shadow: TWO shadows, layered by nesting — a large soft ambient
// on the outer shell plus a tight contact shadow on the inner card (one
// shadow per view is all the platform gives us, so the pair is what makes
// the lift read as real). Both shells are paper; the inner covers the
// outer exactly, so only the shadows show. A subtle paper grain sits on
// top of the fill (translucent, so text stays crisp through it).
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
      <View testID={testID} style={[styles.ambient, shellStyle, style]}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.contact,
            shellStyle,
            { opacity: pressed ? 0.92 : 1 },
          ]}
        >
          {inner}
        </Pressable>
      </View>
    );
  }
  return (
    <View testID={testID} style={[styles.ambient, shellStyle, style]}>
      <View style={[styles.contact, shellStyle]}>{inner}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  ambient: {
    ...shadows.ambient,
  },
  contact: {
    ...shadows.contact,
    padding: 20,
  },
});
