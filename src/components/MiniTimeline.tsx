// Takt — MiniTimeline. A sneak peek of today's calendar inside the
// Today hero: the day's blocks as colour-coded segments on a strip,
// free gaps left as empty track, with a red now-marker (pill + line +
// dot). The strip is ZOOMED (72dp per hour) and DRAGGABLE — a horizontal
// ScrollView wider than the card, centred on now when it first appears,
// so the user can drag to see the whole day. The hour labels sit
// directly under the bar (close to it), not far above it.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text } from './TText';
import type { Block, Category } from '../types';
import { categoryColorHex, colors, fonts, radii } from '../theme/tokens';
import { dayTimelineSegments, minToTime, timelineRange } from '../lib/core';
import { CategoryIcon } from './CategoryIcon';
import { textColorFor } from './calendar/helpers';

/** The only red in the app: the now-marker. */
const NOW_RED = '#E5484D';
/** Zoom: one hour of the day takes this many dp on the strip. */
const PX_PER_HOUR = 72;
/** A segment narrower than this is too small for an icon. */
const ICON_MIN_W = 28;

export interface MiniTimelineProps {
  blocks: Block[];
  nowMin: number;
  categoryById: Map<string, Category>;
}

export function MiniTimeline({ blocks, nowMin, categoryById }: MiniTimelineProps) {
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const viewportW = useRef(0);
  const centeredRef = useRef(false);
  const range = useMemo(() => timelineRange(blocks), [blocks]);
  const segments = useMemo(
    () => (range ? dayTimelineSegments(blocks, range.start, range.end) : []),
    [blocks, range],
  );

  const pxPerMin = PX_PER_HOUR / 60;
  const contentW = range ? (range.end - range.start) * pxPerMin : 0;
  const nowX = range ? (nowMin - range.start) * pxPerMin : 0;
  const showNow = range !== null && nowMin >= range.start && nowMin <= range.end;

  // Centre the strip on now when it first appears (and once more shortly
  // after, in case the layout wasn't ready on the first pass). Only
  // once: after that the user's own scroll position stays put.
  const centerOnNow = useCallback(() => {
    if (centeredRef.current || !showNow || viewportW.current === 0 || contentW === 0) return;
    centeredRef.current = true;
    const x = Math.max(0, Math.min(contentW - viewportW.current, nowX - viewportW.current / 2));
    scrollRef.current?.scrollTo({ x, animated: false });
  }, [showNow, contentW, nowX]);

  useEffect(() => {
    const t = setTimeout(centerOnNow, 150);
    return () => clearTimeout(t);
  }, [centerOnNow]);

  if (!range) return null;

  const hours: number[] = [];
  for (let h = Math.ceil(range.start / 60); h <= Math.floor(range.end / 60); h++) {
    hours.push(h);
  }
  // Keep the pill inside the strip (the line and dot stay exactly on now).
  const pillX = Math.max(28, Math.min(contentW - 28, nowX));

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => {
          viewportW.current = e.nativeEvent.layout.width;
          centerOnNow();
        }}
      >
        <View style={[styles.content, { width: contentW }]}>
          <View style={[styles.barWrap, !showNow && styles.barWrapNoPill]}>
            <View style={styles.bar}>
              {segments.map((seg) => {
                const w = (seg.endMin - seg.startMin) * pxPerMin;
                const cat = seg.categoryId ? categoryById.get(seg.categoryId) : undefined;
                return (
                  <View
                    key={`${seg.startMin}-${seg.endMin}`}
                    style={[
                      styles.segment,
                      { width: w },
                      cat ? { backgroundColor: categoryColorHex[cat.color] } : null,
                    ]}
                  >
                    {cat && w >= ICON_MIN_W ? (
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
                <View style={[styles.nowPill, { left: pillX }]}>
                  <Text style={styles.nowPillText}>{minToTime(nowMin)}</Text>
                </View>
                <View style={[styles.nowLine, { left: nowX }]} />
                <View style={[styles.nowDot, { left: nowX }]} />
              </>
            ) : null}
          </View>
          <View style={styles.labelsRow}>
            {hours.map((h) => {
              const x = (h * 60 - range.start) * pxPerMin;
              const lx = Math.max(14, Math.min(contentW - 14, x));
              return (
                <Text key={h} style={[styles.hourLabel, { left: lx }]}>
                  {minToTime(h * 60)}
                </Text>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const BAR_H = 44;
const PILL_TOP = 30;

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 14 },
  content: { position: 'relative' },
  barWrap: { position: 'relative', paddingTop: PILL_TOP },
  barWrapNoPill: { paddingTop: 0 },
  bar: {
    flexDirection: 'row',
    height: BAR_H,
    backgroundColor: colors.paper,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelsRow: { position: 'relative', height: 16, marginTop: 4 },
  hourLabel: {
    position: 'absolute',
    marginLeft: -14,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.carbon,
    opacity: 0.55,
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
