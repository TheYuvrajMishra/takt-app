// Takt — MiniTimeline. A sneak peek of today's calendar inside the
// Today hero: the WHOLE day (00:00–24:00) as colour-coded block segments
// on a strip, free gaps left as empty track. The strip is ZOOMED so about
// one hour fills the viewport, and DRAGGABLE — a horizontal ScrollView
// wider than the card, so the user can swipe to the end of the day.
//
// The red marker is FIXED at the centre of the viewport (it never moves):
// the strip slides under it. The pill above it shows the time under the
// marker, and the only time labels are the visible window's start and
// end (below the bar, at the viewport edges) — both update automatically
// as the user swipes, without anything changing position. The strip
// starts centred on now.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text } from './TText';
import type { Block, Category } from '../types';
import { categoryColorHex, colors, fonts, radii } from '../theme/tokens';
import { dayTimelineSegments, minToTime } from '../lib/core';
import { CategoryIcon } from './CategoryIcon';
import { textColorFor } from './calendar/helpers';

/** The only red in the app: the centre marker. */
const NOW_RED = '#E5484D';
/** Zoom: one hour of the day takes this many dp — about one hour fills
    the viewport on a phone, so the user reads the day an hour at a time. */
const PX_PER_HOUR = 300;
/** A segment narrower than this is too small for an icon. */
const ICON_MIN_W = 28;
/** The strip always spans the whole day, so the user can swipe to day end. */
const DAY_MIN = 24 * 60;

export interface MiniTimelineProps {
  blocks: Block[];
  nowMin: number;
  categoryById: Map<string, Category>;
}

export function MiniTimeline({ blocks, nowMin, categoryById }: MiniTimelineProps) {
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const viewportW = useRef(0);
  const centeredRef = useRef(false);
  const [scrollX, setScrollX] = useState(0);
  const segments = useMemo(
    () => dayTimelineSegments(blocks, 0, DAY_MIN),
    [blocks],
  );

  const pxPerMin = PX_PER_HOUR / 60;
  const contentW = DAY_MIN * pxPerMin;
  const nowX = nowMin * pxPerMin;

  // The visible window, from the scroll offset: its start and end times
  // (the only time labels) and the time under the fixed centre marker.
  const viewport = viewportW.current;
  const windowStartMin = scrollX / pxPerMin;
  const windowEndMin = (scrollX + viewport) / pxPerMin;
  const centerMin = (scrollX + viewport / 2) / pxPerMin;

  // Centre the strip on now when it first appears (and once more shortly
  // after, in case the layout wasn't ready on the first pass). Only
  // once: after that the user's own scroll position stays put.
  const centerOnNow = useCallback(() => {
    if (centeredRef.current || viewportW.current === 0) return;
    centeredRef.current = true;
    const x = Math.max(0, Math.min(contentW - viewportW.current, nowX - viewportW.current / 2));
    setScrollX(x);
    scrollRef.current?.scrollTo({ x, animated: false });
  }, [contentW, nowX]);

  useEffect(() => {
    const t = setTimeout(centerOnNow, 150);
    return () => clearTimeout(t);
  }, [centerOnNow]);

  return (
    <View style={styles.wrap}>
      <View style={styles.viewport}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          onLayout={(e) => {
            viewportW.current = e.nativeEvent.layout.width;
            centerOnNow();
          }}
        >
          <View style={[styles.content, { width: contentW }]}>
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
          </View>
        </ScrollView>
        {/* Fixed centre marker: the strip slides under it. pointerEvents
            none on each piece so the ScrollView below still gets the drag. */}
        <View style={styles.centerPill} pointerEvents="none">
          <Text style={styles.centerPillText}>{minToTime(Math.floor(centerMin))}</Text>
        </View>
        <View style={styles.centerLine} pointerEvents="none" />
        <View style={styles.centerDot} pointerEvents="none" />
      </View>
      <View style={styles.edgeLabels}>
        <Text style={styles.edgeLabel}>{minToTime(Math.floor(windowStartMin))}</Text>
        <Text style={styles.edgeLabel}>{minToTime(Math.floor(windowEndMin))}</Text>
      </View>
    </View>
  );
}

const BAR_H = 44;
const PILL_TOP = 30;

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 14 },
  viewport: { position: 'relative', paddingTop: PILL_TOP },
  content: { position: 'relative' },
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
  edgeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  edgeLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.carbon, opacity: 0.55 },
  centerPill: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -26,
    backgroundColor: NOW_RED,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  centerPillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.paper },
  centerLine: {
    position: 'absolute',
    top: 26,
    bottom: 0,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: NOW_RED,
  },
  centerDot: {
    position: 'absolute',
    top: PILL_TOP + BAR_H / 2 - 6,
    left: '50%',
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: NOW_RED,
  },
});
