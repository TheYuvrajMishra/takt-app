// Draggable / resizable calendar block card.
//
// Interaction law: NOTHING happens on tap or swipe. A block is picked up
// only after a press-and-hold of HOLD_MS (300ms): the block lifts (scale
// 1.03, soft shadow, grain stays), a tactile haptic fires, and it becomes
// draggable. A quick tap opens the detail peek instead; a swipe starting
// on the block scrolls the grid. Hold near the top edge resizes the start,
// near the bottom edge resizes the end, anywhere else moves the block.
// 5-min snap with a haptic tick per snap; magnetic snap to neighbours.
//
// Adaptive rendering by rendered height — a block is never empty:
// tiny (<=32dp): "Title - 9:00" one line + small icon; small: title +
// time on one line; normal: title, time range, category icon; large:
// title, time, notes preview, subcategory. Data duration never changes;
// tiny blocks only draw at a 28dp minimum visual height.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../TText';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Block } from '../../types';
import { categoryColorHex, colors, fonts, shadows } from '../../theme/tokens';
import { DECEL, HOLD_CANCEL_PX, HOLD_MS, useAppReducedMotion } from '../../theme/motion';
import { minToTime, snap5 } from '../../lib/core';
import { categoryById, formatRange, textColorFor, variantForHeight } from './helpers';
import { CategoryIcon } from '../CategoryIcon';
import { PaperTexture } from '../PaperTexture';
import { useStore } from '../../store/useStore';

export interface BlockCardProps {
  block: Block;
  top: number;
  left: number;
  width: number;
  height: number;
  /** Live hour height (UI thread): the card's top/height and the
      drag/resize px↔min conversions read this, so a pinch moves the card
      without a single React re-render. The plain top/height props are the
      initial render + the variant bucket only. */
  hourHeightSV: SharedValue<number>;
  /** Start positions the dragged block may magnetically snap to. */
  magnetEdges: number[];
  selected: boolean;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onDragStart: (id: string) => void;
  onDragPreview: (id: string, startMin: number) => void;
  onDragEnd: (id: string, startMin: number) => void;
  onResizeStart: (id: string) => void;
  onResizePreview: (id: string, durationMin: number) => void;
  onResizeEnd: (id: string, durationMin: number) => void;
  onResizeTopStart: (id: string) => void;
  onResizeTopPreview: (id: string, startMin: number, durationMin: number) => void;
  onResizeTopEnd: (id: string, startMin: number, durationMin: number) => void;
  onTapBlock: (id: string) => void;
  /** Fires on finalize too (e.g. cancelled drag) so the parent can clear ghost state. */
  onDragCancel: () => void;
}

function tick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function liftHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

const RESIZE_ZONE = 22;
/** Top resize zone (dp from the card's top edge); shrinks on tiny cards. */
const TOP_ZONE = 12;

/** Drag mode: 0 = idle, 1 = move, 2 = resize bottom (end), 3 = resize top (start). */
const MODE_IDLE = 0;
const MODE_MOVE = 1;
const MODE_RESIZE_END = 2;
const MODE_RESIZE_START = 3;

export function BlockCard(props: BlockCardProps) {
  // Worklets (gesture callbacks + useAnimatedStyle) run on the UI runtime.
  // They must NEVER reach into the `props` object: `props` holds functions,
  // so the Worklets runtime treats it as a remote object and any access from
  // a worklet throws "Tried to synchronously call a Remote Function"
  // (crashed on device the first time a block was touched). Destructure every
  // value a worklet needs up front — primitives and function refs are copied
  // into the worklet closure cleanly. The lift is driven by the `lift`
  // shared value (set by the hold gesture), never by reading a prop from
  // inside useAnimatedStyle.
  const {
    block,
    top,
    left,
    width,
    height,
    hourHeightSV,
    magnetEdges,
    onInteractionStart,
    onInteractionEnd,
    onDragStart,
    onDragPreview,
    onDragEnd,
    onResizeStart,
    onResizePreview,
    onResizeEnd,
    onResizeTopStart,
    onResizeTopPreview,
    onResizeTopEnd,
    onTapBlock,
    onDragCancel,
  } = props;
  const { id: blockId, startMin: blockStartMin, durationMin: blockDurationMin } = block;
  const categories = useStore((s) => s.categories);
  const reducedMotion = useAppReducedMotion();
  const ty = useSharedValue(0);
  const lift = useSharedValue(0);
  const mode = useSharedValue(MODE_IDLE);
  const panActivated = useSharedValue(false);
  const lastSnap = useSharedValue(blockStartMin);
  const lastDur = useSharedValue(blockDurationMin);
  const lastTopStart = useSharedValue(blockStartMin);
  const lastTopDur = useSharedValue(blockDurationMin);
  const magnet = useSharedValue<number[]>([]);

  useEffect(() => {
    magnet.value = magnetEdges;
  }, [magnetEdges]);

  // Hold to pick up: fires only if the finger stayed within
  // HOLD_CANCEL_PX for HOLD_MS. Decides the mode from the touch point:
  // top edge = resize start, bottom edge = resize end, middle = move.
  // Zones shrink on tiny cards so a move zone always remains.
  const hold = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(HOLD_CANCEL_PX)
    .onStart((e) => {
      const topZone = Math.min(TOP_ZONE, height / 4);
      const bottomZone = Math.min(RESIZE_ZONE, height / 4);
      const m =
        e.y < topZone ? MODE_RESIZE_START : e.y > height - bottomZone ? MODE_RESIZE_END : MODE_MOVE;
      mode.value = m;
      lift.value = 1;
      runOnJS(liftHaptic)();
      runOnJS(onInteractionStart)();
      if (m === MODE_MOVE) {
        lastSnap.value = blockStartMin;
        runOnJS(onDragStart)(blockId);
      } else if (m === MODE_RESIZE_END) {
        lastDur.value = blockDurationMin;
        runOnJS(onResizeStart)(blockId);
      } else {
        lastTopStart.value = blockStartMin;
        lastTopDur.value = blockDurationMin;
        runOnJS(onResizeTopStart)(blockId);
      }
    })
    .onFinalize(() => {
      // Held, armed, but lifted without ever moving: the Pan never ran,
      // so cancel the arm here (a real drag's Pan finalize already did).
      if (mode.value !== MODE_IDLE && !panActivated.value) {
        mode.value = MODE_IDLE;
        lift.value = 0;
        runOnJS(onInteractionEnd)();
        runOnJS(onDragCancel)();
      }
    });

  // Manual activation: the Pan only claims the touch once the hold has
  // armed it. A quick swipe starting on a block therefore scrolls the
  // grid instead of moving the block.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (mode.value !== MODE_IDLE) state.activate();
    })
    .onStart(() => {
      panActivated.value = true;
    })
    .onUpdate((e) => {
      if (mode.value === MODE_RESIZE_END) {
        const raw = blockDurationMin + (e.translationY / hourHeightSV.value) * 60;
        const d = snap5(Math.max(15, Math.min(24 * 60 - blockStartMin, raw)));
        if (d !== lastDur.value) {
          lastDur.value = d;
          runOnJS(onResizePreview)(blockId, d);
          runOnJS(tick)();
        }
        return;
      }
      if (mode.value === MODE_RESIZE_START) {
        const maxStart = blockStartMin + blockDurationMin - 15;
        const s = snap5(Math.max(0, Math.min(maxStart, blockStartMin + (e.translationY / hourHeightSV.value) * 60)));
        const d = blockDurationMin - (s - blockStartMin);
        if (s !== lastTopStart.value || d !== lastTopDur.value) {
          lastTopStart.value = s;
          lastTopDur.value = d;
          runOnJS(onResizeTopPreview)(blockId, s, d);
          runOnJS(tick)();
        }
        return;
      }
      if (mode.value === MODE_MOVE) {
        ty.value = e.translationY;
        const raw = blockStartMin + (e.translationY / hourHeightSV.value) * 60;
        let s = snap5(Math.max(0, Math.min(24 * 60 - blockDurationMin, raw)));
        for (const edge of magnet.value) {
          if (Math.abs(s - edge) <= 8) {
            s = edge;
            break;
          }
        }
        if (s !== lastSnap.value) {
          lastSnap.value = s;
          runOnJS(onDragPreview)(blockId, s);
          runOnJS(tick)();
        }
      }
    })
    .onEnd(() => {
      if (mode.value === MODE_RESIZE_END) {
        runOnJS(onResizeEnd)(blockId, lastDur.value);
      } else if (mode.value === MODE_RESIZE_START) {
        runOnJS(onResizeTopEnd)(blockId, lastTopStart.value, lastTopDur.value);
      } else if (mode.value === MODE_MOVE) {
        // Settle the card back with timing (not spring), or instantly
        // under reduced motion.
        if (reducedMotion) ty.value = 0;
        else ty.value = withTiming(0, { duration: 120, easing: DECEL });
        runOnJS(onDragEnd)(blockId, lastSnap.value);
      }
    })
    .onFinalize(() => {
      mode.value = MODE_IDLE;
      lift.value = 0;
      panActivated.value = false;
      runOnJS(onInteractionEnd)();
      runOnJS(onDragCancel)();
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onTapBlock)(blockId);
  });

  // Composition (fixed 2026-11-10 — drag/resize were dead on device):
  // the hold and the pan MUST be Simultaneous. With the old
  // Exclusive(hold, pan, tap), the LongPress winning at 300ms cancelled
  // the Pan, so onTouchesMove never ran and the block never moved. The
  // Pan is manualActivation, so it only claims the touch after the hold
  // arms it; a quick swipe still scrolls the grid. The tap sits in
  // Exclusive against the pair, so a hold never also fires the tap.
  const composed = Gesture.Exclusive(Gesture.Simultaneous(hold, pan), tap);

  const animatedStyle = useAnimatedStyle(() => ({
    // Position + size follow the live hour height on the UI thread, so a
    // pinch moves and stretches the card with no React re-render. The
    // plain top/height in the style below are the initial render only —
    // this animated style comes later in the array, so it wins.
    top: (blockStartMin / 60) * hourHeightSV.value,
    height: Math.max(28, (blockDurationMin / 60) * hourHeightSV.value),
    transform: [{ translateY: ty.value }, { scale: 1 + 0.03 * lift.value }],
    // Resting shadow (soft) that deepens while lifted — the card reads as
    // paper sitting on the page, not a flat fill.
    elevation: 2 + 6 * lift.value,
    shadowOpacity: 0.09 + 0.16 * lift.value,
  }));

  const category = categoryById(block.categoryId, categories);
  const bg = categoryColorHex[category.color];
  const fg = textColorFor(category.color);
  const variant = variantForHeight(height);
  const subcategory = category.subcategories?.find((s) => s.id === block.subcategoryId);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.card,
          styles[variant],
          {
            top,
            left,
            width,
            height,
            backgroundColor: bg,
            borderColor: props.selected ? colors.carbon : 'transparent',
          },
          animatedStyle,
        ]}
      >
        {variant === 'tiny' ? (
          <View style={styles.tinyRow}>
            <CategoryIcon icon={category.icon} color={category.color} glyphColor={fg} size={12} />
            <Text style={[styles.tinyText, { color: fg }]} numberOfLines={1}>
              {block.title} - {minToTime(block.startMin)}
            </Text>
          </View>
        ) : variant === 'small' ? (
          <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
            {block.title} · {formatRange(block)}
          </Text>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: fg, flex: 1 }]}
                numberOfLines={variant === 'large' ? 2 : 1}
              >
                {block.title}
              </Text>
              {block.doNotNudge ? (
                <View style={[styles.muteDot, { borderColor: fg }]} />
              ) : null}
            </View>
            <Text style={[styles.meta, { color: fg }]} numberOfLines={1}>
              {formatRange(block)} · {category.name}
            </Text>
            {variant === 'large' ? (
              <>
                {subcategory ? (
                  <Text style={[styles.meta, { color: fg }]} numberOfLines={1}>
                    {subcategory.name}
                  </Text>
                ) : null}
                {block.notes ? (
                  <Text style={[styles.notes, { color: fg }]} numberOfLines={2}>
                    {block.notes}
                  </Text>
                ) : null}
              </>
            ) : null}
          </>
        )}
        {/* No visible resize grips: the top/bottom edge zones resize
            (see the Pan above), but the lines cluttered tiny blocks. */}
        {/* Subtle paper grain over the fill (clipped by overflow hidden). */}
        <PaperTexture radius={12} opacity={0.04} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 8,
    overflow: 'hidden',
    // Resting shadow (soft token); the animated style above deepens the
    // opacity/elevation while lifted.
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowRadius: shadows.soft.shadowRadius,
    shadowOpacity: shadows.soft.shadowOpacity,
  },
  tiny: { paddingTop: 5, paddingBottom: 5 },
  small: { paddingTop: 6, paddingBottom: 6 },
  normal: { paddingTop: 6, paddingBottom: 6 },
  large: { paddingTop: 8, paddingBottom: 8 },
  tinyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tinyText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, flex: 1 },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Hollow dot = this block won't nudge (muted). Border follows the
  // category text colour so it stays visible on dark cards.
  muteDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    opacity: 0.55,
    flexShrink: 0,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.8,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  notes: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.75,
    marginTop: 2,
  },
});
