// Draggable / resizable calendar block card (Worker C).
// One Pan gesture handles both modes: a drag that starts in the bottom
// 22px resize zone resizes, anywhere else moves. Long-press selects,
// tap opens the editor. Magnetic edges are supplied by the parent.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../TText';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Block } from '../../types';
import { categoryColorHex, colors, fonts } from '../../theme/tokens';
import { useAppReducedMotion } from '../../theme/motion';
import { snap5 } from '../../lib/core';
import { categoryById, formatRange, textColorFor } from './helpers';
import { useStore } from '../../store/useStore';

export interface BlockCardProps {
  block: Block;
  top: number;
  left: number;
  width: number;
  height: number;
  hourHeight: number;
  /** Start positions the dragged block may magnetically snap to. */
  magnetEdges: number[];
  selected: boolean;
  dragging: boolean;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onDragStart: (id: string) => void;
  onDragPreview: (id: string, startMin: number) => void;
  onDragEnd: (id: string, startMin: number) => void;
  onResizeStart: (id: string) => void;
  onResizePreview: (id: string, durationMin: number) => void;
  onResizeEnd: (id: string, durationMin: number) => void;
  onLongPressBlock: (id: string) => void;
  onTapBlock: (id: string) => void;
  /** Fires on finalize too (e.g. cancelled drag) so the parent can clear ghost state. */
  onDragCancel: () => void;
}

function tick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

const RESIZE_ZONE = 22;

export function BlockCard(props: BlockCardProps) {
  // Worklets (gesture callbacks + useAnimatedStyle) run on the UI runtime.
  // They must NEVER reach into the `props` object: `props` holds functions,
  // so the Worklets runtime treats it as a remote object and any access from
  // a worklet throws "Tried to synchronously call a Remote Function"
  // (crashed on device the first time a block was touched). Destructure every
  // value a worklet needs up front — primitives and function refs are copied
  // into the worklet closure cleanly. `dragging` changes over time, so it is
  // mirrored into a shared value (same pattern as `magnet` below) instead of
  // being read from props inside useAnimatedStyle.
  const {
    block,
    top,
    left,
    width,
    height,
    hourHeight,
    dragging,
    magnetEdges,
    onInteractionStart,
    onInteractionEnd,
    onDragStart,
    onDragPreview,
    onDragEnd,
    onResizeStart,
    onResizePreview,
    onResizeEnd,
    onLongPressBlock,
    onTapBlock,
    onDragCancel,
  } = props;
  const { id: blockId, startMin: blockStartMin, durationMin: blockDurationMin } = block;
  const categories = useStore((s) => s.categories);
  const reducedMotion = useAppReducedMotion();
  const ty = useSharedValue(0);
  const lastSnap = useSharedValue(blockStartMin);
  const lastDur = useSharedValue(blockDurationMin);
  const mode = useSharedValue(0); // 0 = move, 1 = resize
  const magnet = useSharedValue<number[]>([]);
  const draggingSV = useSharedValue(dragging);

  useEffect(() => {
    magnet.value = magnetEdges;
  }, [magnetEdges]);

  useEffect(() => {
    draggingSV.value = dragging;
  }, [dragging]);

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .activeOffsetY([-6, 6])
    .onBegin(() => {
      runOnJS(onInteractionStart)();
    })
    .onStart((e) => {
      if (e.y > height - RESIZE_ZONE) {
        mode.value = 1;
        lastDur.value = blockDurationMin;
        runOnJS(onResizeStart)(blockId);
      } else {
        mode.value = 0;
        lastSnap.value = blockStartMin;
        runOnJS(onDragStart)(blockId);
      }
    })
    .onUpdate((e) => {
      if (mode.value === 1) {
        const raw = blockDurationMin + (e.translationY / hourHeight) * 60;
        const d = snap5(Math.max(15, Math.min(24 * 60 - blockStartMin, raw)));
        if (d !== lastDur.value) {
          lastDur.value = d;
          runOnJS(onResizePreview)(blockId, d);
          runOnJS(tick)();
        }
        return;
      }
      ty.value = e.translationY;
      const raw = blockStartMin + (e.translationY / hourHeight) * 60;
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
    })
    .onEnd(() => {
      if (mode.value === 1) {
        runOnJS(onResizeEnd)(blockId, lastDur.value);
      } else {
        // Reduced motion: snap back instantly, no 120ms ease.
        if (reducedMotion) ty.value = 0;
        else ty.value = withTiming(0, { duration: 120 });
        runOnJS(onDragEnd)(blockId, lastSnap.value);
      }
    })
    .onFinalize(() => {
      runOnJS(onInteractionEnd)();
      runOnJS(onDragCancel)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      runOnJS(onLongPressBlock)(blockId);
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onTapBlock)(blockId);
  });

  const composed = Gesture.Exclusive(longPress, pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: draggingSV.value ? 0.35 : 1,
  }));

  const category = categoryById(block.categoryId, categories);
  const bg = categoryColorHex[category.color];
  const fg = textColorFor(category.color);
  const compact = height < 44;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.card,
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
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, { color: fg, flex: 1 }]}
            numberOfLines={compact ? 1 : 2}
          >
            {block.title}
          </Text>
          {block.doNotNudge ? (
            <View style={[styles.muteDot, { borderColor: fg }]} />
          ) : null}
        </View>
        {!compact && (
          <Text style={[styles.meta, { color: fg }]} numberOfLines={1}>
            {formatRange(block)} · {category.name}
          </Text>
        )}
        <View style={styles.resizeHandle}>
          <View style={[styles.resizeGrip, { backgroundColor: fg }]} />
        </View>
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
    paddingTop: 6,
    paddingBottom: 18,
    overflow: 'hidden',
  },
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
  },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: RESIZE_ZONE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 5,
  },
  resizeGrip: {
    width: 28,
    height: 3,
    borderRadius: 2,
    opacity: 0.55,
  },
});
