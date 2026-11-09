// Draggable / resizable calendar block card (Worker C).
// One Pan gesture handles both modes: a drag that starts in the bottom
// 22px resize zone resizes, anywhere else moves. Long-press selects,
// tap opens the editor. Magnetic edges are supplied by the parent.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Block } from '../../types';
import { categoryColorHex, colors, fonts } from '../../theme/tokens';
import { snap5 } from '../../lib/core';
import { categoryById, formatRange, textColorFor } from './helpers';

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
  const { block, hourHeight } = props;
  const ty = useSharedValue(0);
  const lastSnap = useSharedValue(block.startMin);
  const lastDur = useSharedValue(block.durationMin);
  const mode = useSharedValue(0); // 0 = move, 1 = resize
  const magnet = useSharedValue<number[]>([]);

  useEffect(() => {
    magnet.value = props.magnetEdges;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.magnetEdges]);

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .activeOffsetY([-6, 6])
    .onBegin(() => {
      runOnJS(props.onInteractionStart)();
    })
    .onStart((e) => {
      if (e.y > props.height - RESIZE_ZONE) {
        mode.value = 1;
        lastDur.value = block.durationMin;
        runOnJS(props.onResizeStart)(block.id);
      } else {
        mode.value = 0;
        lastSnap.value = block.startMin;
        runOnJS(props.onDragStart)(block.id);
      }
    })
    .onUpdate((e) => {
      if (mode.value === 1) {
        const raw = block.durationMin + (e.translationY / hourHeight) * 60;
        const d = snap5(Math.max(15, Math.min(24 * 60 - block.startMin, raw)));
        if (d !== lastDur.value) {
          lastDur.value = d;
          runOnJS(props.onResizePreview)(block.id, d);
          runOnJS(tick)();
        }
        return;
      }
      ty.value = e.translationY;
      const raw = block.startMin + (e.translationY / hourHeight) * 60;
      let s = snap5(Math.max(0, Math.min(24 * 60 - block.durationMin, raw)));
      for (const edge of magnet.value) {
        if (Math.abs(s - edge) <= 8) {
          s = edge;
          break;
        }
      }
      if (s !== lastSnap.value) {
        lastSnap.value = s;
        runOnJS(props.onDragPreview)(block.id, s);
        runOnJS(tick)();
      }
    })
    .onEnd(() => {
      if (mode.value === 1) {
        runOnJS(props.onResizeEnd)(block.id, lastDur.value);
      } else {
        ty.value = withTiming(0, { duration: 120 });
        runOnJS(props.onDragEnd)(block.id, lastSnap.value);
      }
    })
    .onFinalize(() => {
      runOnJS(props.onInteractionEnd)();
      runOnJS(props.onDragCancel)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      runOnJS(props.onLongPressBlock)(block.id);
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(props.onTapBlock)(block.id);
  });

  const composed = Gesture.Exclusive(longPress, pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: props.dragging ? 0.35 : 1,
  }));

  const category = categoryById(block.categoryId);
  const bg = categoryColorHex[category.color];
  const fg = textColorFor(category.color);
  const compact = props.height < 44;

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.card,
          {
            top: props.top,
            left: props.left,
            width: props.width,
            height: props.height,
            backgroundColor: bg,
            borderColor: props.selected ? colors.carbon : 'transparent',
          },
          animatedStyle,
        ]}
      >
        <Text style={[styles.title, { color: fg }]} numberOfLines={compact ? 1 : 2}>
          {block.title}
        </Text>
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
