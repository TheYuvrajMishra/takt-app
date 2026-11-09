// Takt — Chip. Small full-pill label chip, optionally colored and pressable.
import type { PressableProps, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, hairline, radii } from '../theme/tokens';

export interface ChipProps {
  label: string;
  /** Fill color. Defaults to paper with a hairline border. */
  color?: string;
  /** Text color. Defaults to carbon. */
  textColor?: string;
  selected?: boolean;
  onPress?: PressableProps['onPress'];
  style?: ViewStyle;
}

export function Chip({ label, color, textColor = colors.carbon, selected, onPress, style }: ChipProps) {
  const content = (
    <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
      {label}
    </Text>
  );
  const bg = color ?? (selected ? colors.carbon : colors.paper);
  const fg = color ? textColor : selected ? colors.paper : textColor;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
          !color && !selected && styles.bordered,
          style,
        ]}
      >
        <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.base, { backgroundColor: bg }, !color && !selected && styles.bordered, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: { borderWidth: 1, borderColor: hairline },
  text: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
});
