import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { colors, fonts, hairline, radii, spacing } from '../theme/tokens';
import { useAppReducedMotion } from '../theme/motion';
import { dateKey } from '../lib/core';

export interface EndOfDaySheetProps {
  visible: boolean;
  onClose: () => void;
  /** YYYY-MM-DD; defaults to today. */
  date?: string;
  /** Discipline score 0..100 for the day. */
  score: number;
  /** Current streak in days. */
  streak: number;
  done: number;
  missed: number;
  /** One highlight line, e.g. "Deep work finished on time." */
  highlight: string;
  /** Tomorrow's first task, e.g. "07:00 — Morning run". */
  firstTaskTomorrow: string;
  onViewTomorrow?: () => void;
}

/**
 * End-of-day summary sheet. Usable by the Today screen at day end:
 * score, streak, one highlight, tomorrow's first task. No emoji.
 */
export function EndOfDaySheet({
  visible,
  onClose,
  date,
  score,
  streak,
  done,
  missed,
  highlight,
  firstTaskTomorrow,
  onViewTomorrow,
}: EndOfDaySheetProps) {
  const reducedMotion = useAppReducedMotion();
  const label = date ?? dateKey(new Date());
  const readable = new Date(label + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close summary" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.kicker}>Day complete — {readable}</Text>
        <Text style={styles.score}>{score}</Text>
        <Text style={styles.scoreLabel}>discipline score</Text>

        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>day streak</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{done}</Text>
            <Text style={styles.statLabel}>done</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{missed}</Text>
            <Text style={styles.statLabel}>missed</Text>
          </View>
        </View>

        <View style={styles.highlightCard}>
          <Text style={styles.highlightTitle}>Highlight</Text>
          <Text style={styles.highlightText}>{highlight}</Text>
        </View>

        <View style={styles.tomorrowCard}>
          <Text style={styles.tomorrowTitle}>Tomorrow starts with</Text>
          <Text style={styles.tomorrowText}>{firstTaskTomorrow}</Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            onClose();
            onViewTomorrow?.();
          }}
        >
          <Text style={styles.primaryButtonText}>See tomorrow</Text>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={onClose}>
          <Text style={styles.ghostButtonText}>Done for today</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.35)',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
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
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.carbon,
    opacity: 0.6,
    textAlign: 'center',
  },
  score: {
    fontFamily: fonts.semibold,
    fontSize: 84,
    lineHeight: 92,
    color: colors.carbon,
    textAlign: 'center',
  },
  scoreLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.carbon,
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: hairline,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: fonts.semibold, fontSize: 28, color: colors.carbon },
  statLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon, opacity: 0.6 },
  divider: { width: 1, height: 40, backgroundColor: hairline },
  highlightCard: {
    backgroundColor: colors.butter,
    borderRadius: radii.cardSm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  highlightTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.carbon },
  highlightText: { fontFamily: fonts.regular, fontSize: 16, color: colors.carbon, marginTop: 4 },
  tomorrowCard: {
    backgroundColor: colors.cloud,
    borderRadius: radii.cardSm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  tomorrowTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.carbon },
  tomorrowText: { fontFamily: fonts.regular, fontSize: 16, color: colors.carbon, marginTop: 4 },
  primaryButton: {
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
  ghostButton: { paddingVertical: 14, alignItems: 'center' },
  ghostButtonText: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
});
