// Takt — MiniTimeline. A sneak peek of today's calendar inside the
// Today hero: the WHOLE day (00:00–24:00) as colour-coded block segments
// on a strip, free gaps left as empty track. The strip is ZOOMED so about
// one hour fills the viewport, and DRAGGABLE — a horizontal ScrollView
// wider than the card, so the user can swipe to the end of the day.
//
// The red now-marker (pill + line + dot) rides WITH the strip, pinned to
// the current time: the strip starts centred on now, and when the user
// swipes the marker moves with the timeline — it even scrolls off-screen
// (disappears) once now is past the visible hour. The strip fades to
// transparent at the viewport's left and right edges.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './TText';
import type { Block, Category } from '../types';
import { categoryColorHex, colors, fonts, radii } from '../theme/tokens';
import { dayTimelineSegments, minToTime } from '../lib/core';
import { CategoryIcon } from './CategoryIcon';
import { textColorFor } from './calendar/helpers';

/** The only red in the app: the now-marker. */
const NOW_RED = '#E5484D';
/** Zoom: one hour of the day takes this many dp — about one hour fills
    the viewport on a phone, so the user reads the day an hour at a time. */
const PX_PER_HOUR = 300;
/** A segment narrower than this is too small for an icon. */
const ICON_MIN_W = 28;
/** The strip always spans the whole day, so the user can swipe to day end. */
const DAY_MIN = 24 * 60;
/** The strip fades into the card over this many dp at each viewport edge. */
const FADE_W = 28;

/** A #RRGGBB colour plus its fully transparent twin, for the edge fade. */
function fadePair(hex: string): [string, string] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [hex, 'rgba(0,0,0,0)'];
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [hex, `rgba(${r},${g},${b},0)`];
}

export interface MiniTimelineProps {
  blocks: Block[];
  nowMin: number;
  categoryById: Map<string, Category>;
  /** The card behind the strip — the edge fade blends into this colour. */
  cardColor?: string;
}

export function MiniTimeline({
  blocks,
  nowMin,
  categoryById,
  cardColor = colors.butter,
}: MiniTimelineProps) {
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
  // (the only time labels) update as the user swipes.
  const viewport = viewportW.current;
  const windowStartMin = scrollX / pxPerMin;
  const windowEndMin = (scrollX + viewport) / pxPerMin;

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

  // Keep the pill inside the strip (the line and dot stay exactly on now).
  const pillX = Math.max(28, Math.min(contentW - 28, nowX));
  const [fadeSolid, fadeClear] = fadePair(cardColor);

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
            <View style={styles.barWrap}>
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
              {/* The now-marker rides with the strip, pinned to now. */}
              <View style={[styles.nowPill, { left: pillX }]}>
                <Text style={styles.nowPillText}>{minToTime(nowMin)}</Text>
              </View>
              <View style={[styles.nowLine, { left: nowX }]} />
              <View style={[styles.nowDot, { left: nowX }]} />
            </View>
          </View>
        </ScrollView>
        {/* Edge fades: the strip dissolves into the card at the viewport
            edges. pointerEvents none so the drag still reaches the strip. */}
        <LinearGradient
          colors={[fadeSolid, fadeClear]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, styles.fadeLeft]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[fadeClear, fadeSolid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fade, styles.fadeRight]}
          pointerEvents="none"
        />
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
  barWrap: { position: 'relative' },
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
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE_W },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
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
