// Takt — MiniTimeline. A sneak peek of today's calendar inside the
// Today hero: one bar from the first block's start to the last block's
// end, each block a colour-coded segment (its category icon centred when
// the segment is wide enough), free gaps left as empty track — so the
// user sees exactly when they are free. A red marker shows now: a time
// pill above the bar, a line through it, and a dot on it. The marker
// hides when now is outside the day's range.
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './TText';
import type { Block, Category } from '../types';
import { categoryColorHex, colors, fonts, radii } from '../theme/tokens';
import { dayTimelineSegments, minToTime, timelinePct, timelineRange } from '../lib/core';
import { CategoryIcon } from './CategoryIcon';
import { textColorFor } from './calendar/helpers';

/** The only red in the app: the now-marker. */
const NOW_RED = '#E5484D';
/** A segment narrower than this share of the bar is too small for an icon. */
const ICON_MIN_SHARE = 0.09;

export interface MiniTimelineProps {
  blocks: Block[];
  nowMin: number;
  categoryById: Map<string, Category>;
}

export function MiniTimeline({ blocks, nowMin, categoryById }: MiniTimelineProps) {
  const range = useMemo(() => timelineRange(blocks), [blocks]);
  const segments = useMemo(
    () => (range ? dayTimelineSegments(blocks, range.start, range.end) : []),
    [blocks, range],
  );
  if (!range) return null;
  const span = range.end - range.start;
  const nowPct = timelinePct(nowMin, range.start, range.end);
  const showNow = nowMin >= range.start && nowMin <= range.end;
  // Keep the pill inside the bar: near the ends it would hang off, so
  // clamp only the pill (the line and dot stay exactly on now).
  const pillPct = Math.max(0.08, Math.min(0.92, nowPct));
  return (
    <View style={styles.wrap}>
      <View style={styles.labels}>
        <Text style={styles.label}>{minToTime(range.start)}</Text>
        <Text style={styles.label}>{minToTime(range.end)}</Text>
      </View>
      <View style={styles.barWrap}>
        <View style={styles.bar}>
          {segments.map((seg) => {
            const share = (seg.endMin - seg.startMin) / span;
            const cat = seg.categoryId ? categoryById.get(seg.categoryId) : undefined;
            return (
              <View
                key={`${seg.startMin}-${seg.endMin}`}
                style={[
                  styles.segment,
                  { flexGrow: seg.endMin - seg.startMin },
                  cat ? { backgroundColor: categoryColorHex[cat.color] } : null,
                ]}
              >
                {cat && share >= ICON_MIN_SHARE ? (
                  <CategoryIcon
                    icon={cat.icon}
                    color={cat.color}
                    glyphColor={textColorFor(cat.color)}
                    size={18}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        {showNow ? (
          <>
            <View style={[styles.nowPill, { left: `${pillPct * 100}%` }]}>
              <Text style={styles.nowPillText}>{minToTime(nowMin)}</Text>
            </View>
            <View style={[styles.nowLine, { left: `${nowPct * 100}%` }]} />
            <View style={[styles.nowDot, { left: `${nowPct * 100}%` }]} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const BAR_H = 44;
const PILL_TOP = 30;

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 14 },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.carbon, opacity: 0.55 },
  barWrap: { position: 'relative', paddingTop: PILL_TOP },
  bar: {
    flexDirection: 'row',
    height: BAR_H,
    backgroundColor: colors.paper,
    borderRadius: 12,
    padding: 2,
    overflow: 'hidden',
  },
  segment: {
    borderRadius: 8,
    marginHorizontal: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPill: {
    position: 'absolute',
    top: 0,
    marginLeft: -26,
    backgroundColor: NOW_RED,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nowPillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.paper },
  nowLine: {
    position: 'absolute',
    top: 26,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: NOW_RED,
  },
  nowDot: {
    position: 'absolute',
    top: PILL_TOP + BAR_H / 2 - 6,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: NOW_RED,
  },
});
