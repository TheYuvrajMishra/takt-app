import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { CategoryIcon } from '../../components/CategoryIcon';
import { colors, fonts, hairline, radii, spacing, categoryColorHex } from '../../theme/tokens';
import { DEFAULT_CATEGORIES } from '../../types';
import { dateKey } from '../../lib/core';
import {
  computeStreaks,
  daySummary,
  monthlyScores,
  onTimeRate,
  perCategoryFocusMinutes,
  sampleDataset,
  weeklyTrend,
} from '../../lib/stats';

// TODO (store wiring): `src/store/useStore.ts` exists but does not compile
// yet (Worker A: wrong './core'/'./db' paths, 'CategoryColorName' import).
// Until it is fixed, stats run on `sampleDataset()`. Swap this line for
// `daysFromStore(getBlocksForDate, completions)` from `src/lib/stats.ts`
// once the store is green — no other screen logic changes.

const CELL = 40;
const GAP = 4;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Score 0..100 -> hatch level 0..4. 0 = no data / empty day. */
function scoreLevel(score: number, hasData: boolean): number {
  if (!hasData) return 0;
  if (score >= 85) return 4;
  if (score >= 65) return 3;
  if (score >= 45) return 2;
  if (score >= 20) return 1;
  return 0;
}

/** One heatmap cell: cloud square, carbon 45-degree hatch, denser = higher score. */
function HatchCell({ level, fill }: { level: number; fill?: string }) {
  const spacingPx = [0, 20, 14, 10, 7][level];
  const lines: number[] = [];
  if (spacingPx > 0) {
    for (let k = -32; k <= 0; k += spacingPx) lines.push(k);
  }
  return (
    <View style={[styles.cell, fill ? { backgroundColor: fill } : undefined]}>
      <Svg width={CELL} height={CELL} viewBox="0 0 32 32">
        {lines.map((k) => (
          <Line
            key={k}
            x1={k}
            y1={32}
            x2={k + 32}
            y2={0}
            stroke={colors.carbon}
            strokeWidth={1.4}
            opacity={0.75}
          />
        ))}
      </Svg>
    </View>
  );
}

export default function StatsScreen() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // TODO (store wiring): swap this for useStore() data.
  const days = useMemo(() => sampleDataset(), []);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();

  const filteredDays = useMemo(
    () =>
      selectedCats.length === 0
        ? days
        : days.map((d) => ({
            ...d,
            blocks: d.blocks.filter((b) => selectedCats.includes(b.categoryId)),
          })),
    [days, selectedCats],
  );

  const scores = useMemo(() => monthlyScores(filteredDays, year, month), [filteredDays, year, month]);
  const hasData = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of filteredDays) m.set(d.date, d.blocks.length > 0);
    return m;
  }, [filteredDays]);

  const streaks = useMemo(() => computeStreaks(filteredDays), [filteredDays]);
  const onTime = useMemo(() => onTimeRate(filteredDays), [filteredDays]);
  const focus = useMemo(
    () => perCategoryFocusMinutes(filteredDays, selectedCats.length > 0 ? selectedCats : undefined),
    [filteredDays, selectedCats],
  );
  const trend = useMemo(() => weeklyTrend(filteredDays), [filteredDays]);
  const totalFocusMin = useMemo(() => focus.reduce((s, f) => s + f.minutes, 0), [focus]);

  const summary = selectedDate ? daySummary(filteredDays, selectedDate) : null;

  const toggleCat = (id: string) =>
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  /** Dominant filtered category for a day, for the colored-cell mode. */
  const dayDominantColor = (date: string): string | undefined => {
    if (selectedCats.length === 0) return undefined;
    const day = filteredDays.find((d) => d.date === date);
    if (!day || day.blocks.length === 0) return undefined;
    const totals = new Map<string, number>();
    for (const b of day.blocks) totals.set(b.categoryId, (totals.get(b.categoryId) ?? 0) + b.durationMin);
    let bestId = '';
    let bestMin = -1;
    for (const [id, min] of totals) {
      if (min > bestMin) {
        bestMin = min;
        bestId = id;
      }
    }
    const cat = DEFAULT_CATEGORIES.find((c) => c.id === bestId);
    if (!cat) return undefined;
    const level = scoreLevel(scores.get(date) ?? 0, true);
    return hexToRgba(categoryColorHex[cat.color], 0.3 + level * 0.14);
  };

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null as string | null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateKey(new Date(year, month, i + 1))),
  ];
  const isCurrentMonth = monthOffset === 0;
  const maxTrend = Math.max(1, ...trend.map((t) => t.score));
  const topFocusId = focus[0]?.categoryId;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stats</Text>
      <Text style={styles.subtitle}>Your discipline, in one view.</Text>

      {/* Category filter chips (multi-select) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
        {DEFAULT_CATEGORIES.map((cat) => {
          const active = selectedCats.includes(cat.id);
          return (
            <Pressable
              key={cat.id}
              onPress={() => toggleCat(cat.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <CategoryIcon icon={cat.icon} color={cat.color} size={20} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Month heatmap */}
      <View style={styles.card}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonthOffset((o) => o - 1)} style={styles.navButton} accessibilityLabel="Previous month">
            <Text style={styles.navButtonText}>{'<'}</Text>
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTHS[month]} {year}
          </Text>
          <Pressable
            onPress={() => setMonthOffset((o) => (o >= 0 ? o : o + 1))}
            style={[styles.navButton, isCurrentMonth && styles.navButtonDisabled]}
            disabled={isCurrentMonth}
            accessibilityLabel="Next month"
          >
            <Text style={styles.navButtonText}>{'>'}</Text>
          </Pressable>
        </View>
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={`${w}-${i}`} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((date, i) =>
            date === null ? (
              <View key={`blank-${i}`} style={styles.cellSpacer} />
            ) : (
              <Pressable key={date} onPress={() => setSelectedDate(date)} accessibilityLabel={`Stats for ${date}`}>
                <HatchCell
                  level={scoreLevel(scores.get(date) ?? 0, hasData.get(date) ?? false)}
                  fill={dayDominantColor(date)}
                />
              </Pressable>
            ),
          )}
        </View>
        <Text style={styles.legend}>Denser hatch means a stronger day. Tap a day for details.</Text>
      </View>

      {/* Streak + on-time cards */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{streaks.current}</Text>
          <Text style={styles.statLabel}>current streak</Text>
          <Text style={styles.statSub}>days</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{streaks.best}</Text>
          <Text style={styles.statLabel}>best streak</Text>
          <Text style={styles.statSub}>days</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{onTime}%</Text>
          <Text style={styles.statLabel}>on-time rate</Text>
          <Text style={styles.statSub}>of completions</Text>
        </View>
      </View>

      {/* Focus time per category — white bars on butter, top bar solid carbon */}
      <View style={[styles.card, styles.butterCard]}>
        <Text style={styles.cardTitle}>Focus time per category</Text>
        <Text style={styles.cardSub}>
          {Math.floor(totalFocusMin / 60)}h {totalFocusMin % 60}m total
        </Text>
        {focus.length === 0 ? (
          <Text style={styles.emptyText}>No focus time in this view yet.</Text>
        ) : (
          focus.slice(0, 6).map((f) => {
            const cat = DEFAULT_CATEGORIES.find((c) => c.id === f.categoryId);
            const maxMin = Math.max(1, ...focus.map((x) => x.minutes));
            const isTop = f.categoryId === topFocusId;
            return (
              <View key={f.categoryId} style={styles.barRow}>
                <Text style={styles.barLabel}>{cat?.name ?? f.categoryId}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.max(4, (f.minutes / maxMin) * 100)}%` },
                      isTop && styles.barFillActive,
                    ]}
                  />
                </View>
                <Text style={styles.barValue}>{f.hours}h</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Weekly trend */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weekly trend</Text>
        <Text style={styles.cardSub}>Discipline score, last 7 days</Text>
        <View style={styles.trendRow}>
          {trend.map((t) => (
            <View key={t.date} style={styles.trendCol}>
              <View style={styles.trendTrack}>
                <View
                  style={[
                    styles.trendFill,
                    { height: `${Math.max(4, (t.score / maxTrend) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.trendScore}>{t.score}</Text>
              <Text style={styles.trendDay}>
                {new Date(t.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Focus by category list */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Focus by category</Text>
        {focus.length === 0 ? (
          <Text style={styles.emptyText}>Nothing to show yet.</Text>
        ) : (
          focus.map((f) => {
            const cat = DEFAULT_CATEGORIES.find((c) => c.id === f.categoryId);
            if (!cat) return null;
            return (
              <View key={f.categoryId} style={styles.focusRow}>
                <CategoryIcon icon={cat.icon} color={cat.color} size={28} />
                <Text style={styles.focusName}>{cat.name}</Text>
                <Text style={styles.focusHours}>{f.hours}h</Text>
                <Text style={styles.focusPct}>{f.pct}%</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Day summary sheet */}
      <Modal visible={summary !== null} transparent animationType="slide" onRequestClose={() => setSelectedDate(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedDate(null)} accessibilityLabel="Close day summary" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {summary && (
            <>
              <Text style={styles.sheetTitle}>
                {new Date(summary.date + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
              <Text style={styles.sheetScore}>{summary.score}</Text>
              <Text style={styles.sheetScoreLabel}>discipline score</Text>
              <View style={styles.sheetRow}>
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatValue}>{summary.done}</Text>
                  <Text style={styles.sheetStatLabel}>done</Text>
                </View>
                <View style={styles.sheetDivider} />
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatValue}>{summary.missed}</Text>
                  <Text style={styles.sheetStatLabel}>missed</Text>
                </View>
                <View style={styles.sheetDivider} />
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatValue}>{summary.nudgesNeeded}</Text>
                  <Text style={styles.sheetStatLabel}>nudges needed</Text>
                </View>
                <View style={styles.sheetDivider} />
                <View style={styles.sheetStat}>
                  <Text style={styles.sheetStatValue}>{summary.onTimePct}%</Text>
                  <Text style={styles.sheetStatLabel}>on-time</Text>
                </View>
              </View>
              {summary.total === 0 && (
                <Text style={styles.emptyText}>No blocks scheduled for this day.</Text>
              )}
              <Pressable style={styles.sheetButton} onPress={() => setSelectedDate(null)}>
                <Text style={styles.sheetButtonText}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontFamily: fonts.semibold, fontSize: 34, color: colors.carbon },
  subtitle: { fontFamily: fonts.regular, fontSize: 16, color: colors.carbon, opacity: 0.6, marginBottom: spacing.md },
  chipsRow: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: hairline,
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.carbon, borderColor: colors.carbon },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  chipTextActive: { color: colors.paper },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  butterCard: { backgroundColor: colors.butter },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.cloud,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: { opacity: 0.35 },
  navButtonText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.carbon },
  monthLabel: { fontFamily: fonts.semibold, fontSize: 18, color: colors.carbon },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  weekday: {
    width: CELL,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.carbon,
    opacity: 0.55,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 10,
    backgroundColor: colors.cloud,
    overflow: 'hidden',
  },
  cellSpacer: { width: CELL, height: CELL },
  legend: { fontFamily: fonts.regular, fontSize: 13, color: colors.carbon, opacity: 0.6, marginTop: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radii.cardSm,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontFamily: fonts.semibold, fontSize: 34, color: colors.carbon },
  statLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon },
  statSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.carbon, opacity: 0.55 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.carbon },
  cardSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.carbon, opacity: 0.6, marginBottom: spacing.sm },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, color: colors.carbon, opacity: 0.6, paddingVertical: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  barLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, width: 78 },
  barTrack: { flex: 1, height: 14, borderRadius: 999, backgroundColor: 'rgba(10,10,10,0.08)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.paper, borderRadius: 999 },
  barFillActive: { backgroundColor: colors.carbon },
  barValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.carbon, width: 40, textAlign: 'right' },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  trendCol: { alignItems: 'center', flex: 1 },
  trendTrack: { height: 72, width: 18, justifyContent: 'flex-end' },
  trendFill: { width: 18, borderRadius: 999, backgroundColor: colors.mint },
  trendScore: { fontFamily: fonts.semibold, fontSize: 13, color: colors.carbon, marginTop: 6 },
  trendDay: { fontFamily: fonts.regular, fontSize: 12, color: colors.carbon, opacity: 0.55 },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: hairline,
  },
  focusName: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  focusHours: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  focusPct: { fontFamily: fonts.regular, fontSize: 14, color: colors.carbon, opacity: 0.6, width: 44, textAlign: 'right' },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,10,0.35)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: colors.carbon, opacity: 0.2, marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 20, color: colors.carbon, textAlign: 'center' },
  sheetScore: { fontFamily: fonts.semibold, fontSize: 64, lineHeight: 72, color: colors.carbon, textAlign: 'center', marginTop: spacing.sm },
  sheetScoreLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, opacity: 0.6, textAlign: 'center', marginBottom: spacing.md },
  sheetRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: hairline, paddingVertical: spacing.md, marginBottom: spacing.md },
  sheetStat: { flex: 1, alignItems: 'center' },
  sheetStatValue: { fontFamily: fonts.semibold, fontSize: 24, color: colors.carbon },
  sheetStatLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.carbon, opacity: 0.6 },
  sheetDivider: { width: 1, height: 36, backgroundColor: hairline },
  sheetButton: { backgroundColor: colors.carbon, borderRadius: radii.pill, paddingVertical: 15, alignItems: 'center' },
  sheetButtonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
});
