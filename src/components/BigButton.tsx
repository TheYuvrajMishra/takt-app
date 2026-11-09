// Takt — BigButton. The large pill button (e.g. the Done button on Today).
// Primary is carbon with paper text; secondary is paper with a hairline border.
import type { PressableProps, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './TText';
import { colors, fonts, hairline, radii } from '../theme/tokens';

export interface BigButtonProps {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}

export function BigButton({ label, onPress, variant = 'primary', disabled, style }: BigButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, variant === 'primary' ? styles.primaryText : styles.secondaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
  },
  primary: { backgroundColor: colors.carbon },
  secondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: hairline },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
  text: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24 },
  primaryText: { color: colors.paper },
  secondaryText: { color: colors.carbon },
});
