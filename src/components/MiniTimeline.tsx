// Takt — MiniTimeline. The Today hero's sneak peek of the day's timeline:
// one horizontal bar from the first block's start to the last block's
// end, with a colour-coded segment per block and the free gaps left as
// empty track, so the user sees at a glance where they are free. A red
// marker (pill with the current time above the bar, a line through it,
// a dot on it) shows where now is. Segments wide enough for an icon get
// the category icon centred inside them.
import { StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { CategoryIcon } from './CategoryIcon';
import type { Block } from '../types';
import { categoryColorHex, colors, fonts, hairline } from '../theme/tokens';
import { dayTimelineSegments, minToTime, timelinePct, timelineRange } from '../lib/core';
import { categoryById } from './calendar/helpers';
import { useStore } from '../store/useStore';

/** Red for the now-marker (the only red in the app — it must read as "now"). */
const NOW_RED = '#E5484D';
/** The bar's inner width is ~320dp on a phone; segments wider than this
 * (in estimated px) get their category icon. */
const BAR_EST_PX = 320;
const ICON_MIN_PX = 44;
/** Half the now-pill's fixed width, for centring it on the marker. */
const PILL_HALF_W = 30;

export function MiniTimeline({ blocks, nowMin }: { blocks: Block[]; nowMin: number }) {
  const categories = useStore((s) => s.categories);
  const range = timelineRange(blocks);
  if (!range) return null;
  const segments = dayTimelineSegments(blocks);
  const span = range.end - range.start;
  const nowPct = timelinePct(nowMin, range.start, range.end);
  const showNow = nowMin >= range.start && nowMin <= range.end;
  // Keep the pill inside the bar (it is 60dp wide, so clamp its centre
  // to ~9%..91% of the bar).
  const pillPct = Math.max(9, Math.min(91, nowPct));
  return (
    <View style={styles.root}>
      <View style={styles.labelsRow}>
        <Text style={styles.label}>{minToTime(range.start)}</Text>
        <Text style={styles.label}>{minToTime(range.end)}</Text>
      </View>
      <View style={styles.bar}>
        {segments.map((seg, i) => {
          if (seg.kind === 'free') {
            return <View key={`free-${i}`} style={{ flex: seg.endMin - seg.startMin }} />;
          }
          const category = categoryById(seg.block!.categoryId, categories);
          const estPx = ((seg.endMin - seg.startMin) / span) * BAR_EST_PX;
          return (
            <View
              key={`block-${seg.block!.id}`}
              style={[
                styles.segment,
                { flex: seg.endMin - seg.startMin, backgroundColor: categoryColorHex[category.color] },
              ]}
            >
              {estPx >= ICON_MIN_PX ? (
                <CategoryIcon icon={category.icon} color={category.color} size={18} />
              ) : null}
            </View>
          );
        })}
        {showNow ? (
          <>
            <View style={[styles.nowLine, { left: `${nowPct}%` }]} pointerEvents="none" />
            <View style={[styles.nowDot, { left: `${nowPct}%` }]} pointerEvents="none" />
          </>
        ) : null}
      </View>
      {showNow ? (
        <View style={[styles.nowPill, { left: `${pillPct}%` }]} pointerEvents="none">
          <Text style={styles.nowPillText}>{minToTime(nowMin)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', position: 'relative' },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.carbon, opacity: 0.6 },
  bar: {
    flexDirection: 'row',
    gap: 2,
    height: 44,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 12,
    padding: 3,
    position: 'relative',
  },
  segment: {
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nowLine: {
    position: 'absolute',
    top: -24,
    bottom: 0,
    width: 2,
    backgroundColor: NOW_RED,
    transform: [{ translateX: -1 }],
  },
  nowDot: {
    position: 'absolute',
    // Centred on the 44dp bar: (44 - 10) / 2.
    top: 17,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NOW_RED,
    borderWidth: 2,
    borderColor: colors.paper,
    transform: [{ translateX: -5 }],
  },
  nowPill: {
    position: 'absolute',
    // In the labels row (above the bar), centred on the marker.
    top: -2,
    width: 60,
    paddingVertical: 3,
    alignItems: 'center',
    backgroundColor: NOW_RED,
    borderRadius: 999,
    transform: [{ translateX: -PILL_HALF_W }],
  },
  nowPillText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 16, color: colors.paper },
});
