// Takt — BlockChip. One block in the Today timeline strip: time + title,
// colored by status (mint complete, apricot progress, carbon missed,
// hatched cloud upcoming). Fixed width so the strip can auto-center on now.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { colors, fonts, radii, statusColors } from '../theme/tokens';
import { minToTime } from '../lib/core';
import { Hatch } from './Hatch';
import type { Block, Category } from '../types';
import type { PillStatus } from './Pill';
import { CategoryIcon } from './CategoryIcon';

export const BLOCK_CHIP_WIDTH = 108;

export interface BlockChipProps {
  block: Block;
  category?: Category;
  status: PillStatus;
  /** Highlights the chip as the current block. */
  isNow?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function BlockChip({ block, category, status, isNow, onPress, style }: BlockChipProps) {
  const isMissed = status === 'missed';
  const isUpcoming = status === 'upcoming';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: statusColors[status], width: BLOCK_CHIP_WIDTH },
        isNow && styles.now,
        pressed && styles.pressed,
        style,
      ]}
    >
      {isUpcoming && <Hatch opacity={0.16} spacing={7} style={styles.hatch} />}
      <View style={styles.iconRow}>
        {category ? (
          <CategoryIcon icon={category.icon} color={category.color} size={20} />
        ) : null}
        <Text style={[styles.time, isMissed && styles.missedText]}>{minToTime(block.startMin)}</Text>
      </View>
      <Text
        style={[styles.title, isMissed && styles.missedText]}
        numberOfLines={2}
      >
        {block.title}
      </Text>
      <Text style={[styles.duration, isMissed && styles.missedText]}>
        {block.durationMin} min
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    padding: 10,
    marginRight: 8,
    minHeight: 108,
    overflow: 'hidden',
  },
  now: {
    borderWidth: 2,
    borderColor: colors.carbon,
  },
  pressed: { opacity: 0.85 },
  hatch: { borderRadius: 20 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  time: { fontFamily: fonts.semibold, fontSize: 13, color: colors.carbon },
  title: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17, color: colors.carbon },
  duration: { fontFamily: fonts.regular, fontSize: 11, color: colors.carbon, opacity: 0.6, marginTop: 4 },
  missedText: { color: colors.paper },
});
