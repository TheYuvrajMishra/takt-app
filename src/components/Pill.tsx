// Takt — status Pill. Complete mint, Progress apricot, Missed carbon/white,
// Upcoming hatched cloud (DESIGN.md).
import { StyleSheet, View } from 'react-native';
import { Text } from './TText';
import type { ViewStyle } from 'react-native';
import { colors, fonts, radii, statusColors } from '../theme/tokens';
import { Hatch } from './Hatch';
import type { BlockStatus } from '../types';

export type PillStatus = Exclude<BlockStatus, 'skipped'> | 'now';

const DEFAULT_LABELS: Record<PillStatus, string> = {
  complete: 'Complete',
  progress: 'In progress',
  missed: 'Missed',
  upcoming: 'Upcoming',
  // The block's time is now, but the user has not pressed Start.
  now: 'Now',
};

export interface PillProps {
  status: PillStatus;
  label?: string;
  style?: ViewStyle;
}

export function Pill({ status, label, style }: PillProps) {
  const text = label ?? DEFAULT_LABELS[status];
  const isMissed = status === 'missed';
  const isUpcoming = status === 'upcoming';
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: statusColors[status] },
        isMissed && styles.missed,
        style,
      ]}
    >
      {isUpcoming && <Hatch opacity={0.16} spacing={7} style={styles.hatch} />}
      <Text style={[styles.text, isMissed && styles.missedText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  missed: {
    // Missed is carbon with white text; keep the pill readable.
  },
  hatch: { borderRadius: radii.pill },
  text: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.carbon,
  },
  missedText: { color: colors.paper },
});
