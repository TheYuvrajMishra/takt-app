// Takt — Card. Paper (white) raised card only; cloud is the app background,
// never a card fill (DESIGN.md).
import type { ReactNode } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme/tokens';

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
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          { backgroundColor: color, borderRadius: radius, opacity: pressed ? 0.92 : 1 },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[styles.base, { backgroundColor: color, borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 20,
    // Soft lift, carbon-tinted shadow (no grey token).
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
});
