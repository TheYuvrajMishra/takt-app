// Takt — Calendar mode (Worker C).
// Google-Calendar-style editor: day / 3-day / week hour grid, drag to
// move (5-min snap, magnetic neighbours, ghost + time tooltip), drag the
// bottom edge to resize, long-press empty slot to create, long-press a
// block to multi-select, copy/paste, duplicate, undo/redo, pinch zoom,
// two-finger swipe to change day, scope sheet on every change, routine
// template picker. Blocks come from the zustand store
// (src/store/useStore.ts); every mutation runs through a store action
// with the scope the user picks in the scope sheet. The bottom dock is
// the real shared Dock.tsx — dropping a node onto the grid creates the
// block at the drop position, dropping outside the grid (or tapping the
// "+" customize action) falls back to the earliest free slot.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Text, TextInput } from '../../components/TText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { DECEL } from '../../theme/motion';
import * as Haptics from 'expo-haptics';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_DURATION_MIN,
  type Block,
  type Category,
  type Scope,
} from '../../types';
import { categoryColorHex, colors, faintText, fonts, hairline, radii, spacing } from '../../theme/tokens';
import { dateKey, defaultDoNotNudgeFor, earliestEmptySlot, minToTime, overlaps, snap5 } from '../../lib/core';
import {
  addDays,
  assignLanes,
  autoShiftBlocks,
  categoryById,
  formatRange,
  newId,
  ROUTINE_TEMPLATES,
  startOfWeek,
  type RoutineTemplateDef,
} from '../../components/calendar/helpers';
import { BlockCard } from '../../components/calendar/BlockCard';
import { Dock } from '../../components/Dock';
import { RadialMenu } from '../../components/RadialMenu';
import { useRadialDrag } from '../../components/useRadialDrag';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Sheet } from '../../components/Sheet';
import { useBottomInset, ScrollScreen } from '../../components/layout';
import { useStore } from '../../store/useStore';

type ViewMode = 'day' | '3day' | 'week';

interface Ghost {
  blockId: string;
  date: string;
  startMin: number;
  durationMin: number;
}

interface ClipboardItem {
  categoryId: string;
  title: string;
  startMin: number;
  durationMin: number;
}

type QuickSheet =
  | { mode: 'create'; date: string; startMin: number }
  | { mode: 'edit'; date: string; block: Block };

interface SwapSheet {
  moved: Block;
  origStart: number;
  date: string;
  conflict: Block;
}

/** A mutation waiting on the scope sheet: runs once a scope is picked. */
interface PendingChange {
  description: string;
  run: (scope: Scope) => Promise<void>;
}

const GUTTER = 48;
const HOURS = 24;
const MIN_HOUR_H = 48;
const MAX_HOUR_H = 240;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SCOPE_LABELS: Record<Scope, string> = {
  today: 'Today only',
  onwards: 'From today onwards',
  weekday: 'This weekday from today',
};

/**
 * Clamp a number into [lo, hi]. Called from the pinch-zoom gesture worklet
 * as well as the JS thread, so it must be a worklet — a plain function
 * called from a worklet throws "[Worklets] Tried to synchronously call a
 * Remote Function" on device (hit 2026-11-10: pinch to zoom crashed).
 */
function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, v));
}

function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** One hour row: its height follows the live hour height on the UI
    thread, so a pinch stretches the grid with no React re-render. */
function HourRow({ hourHeightSV, h }: { hourHeightSV: SharedValue<number>; h: number }) {
  const rowStyle = useAnimatedStyle(() => ({ height: hourHeightSV.value }));
  return (
    <Animated.View style={[styles.hourRow, rowStyle]}>
      <View style={styles.hourLabelWrap}>
        <Text style={styles.hourLabel}>{minToTime(h * 60)}</Text>
      </View>
      <View style={styles.hourLine} />
    </Animated.View>
  );
}

/** The "now" line: its top follows the live hour height on the UI thread. */
function NowLine({
  hourHeightSV,
  nowMin,
  left,
  width,
}: {
  hourHeightSV: SharedValue<number>;
  nowMin: number;
  left: number;
  width: number;
}) {
  const lineStyle = useAnimatedStyle(() => ({ top: (nowMin / 60) * hourHeightSV.value }));
  return (
    <Animated.View pointerEvents="none" style={[styles.nowLine, { left, width }, lineStyle]}>
      <View style={styles.nowPin} />
      <Text style={styles.nowLabel}>{minToTime(nowMin)}</Text>
    </Animated.View>
  );
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const gridRef = useRef<React.ComponentRef<typeof View> | null>(null);

  // Store: blocks resolve per date (override wins, else template).
  // templates / dayOverrides are subscribed so the grid re-renders on
  // every block change, including undo/redo.
  const hydrated = useStore((s) => s.hydrated);
  const load = useStore((s) => s.load);
  const categories = useStore((s) => s.categories);
  const templates = useStore((s) => s.templates);
  const dayOverrides = useStore((s) => s.dayOverrides);
  const getBlocksForDate = useStore((s) => s.getBlocksForDate);
  const addBlock = useStore((s) => s.addBlock);
  const moveBlock = useStore((s) => s.moveBlock);
  const resizeBlock = useStore((s) => s.resizeBlock);
  const patchBlock = useStore((s) => s.patchBlock);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const markDone = useStore((s) => s.markDone);
  const updateSettings = useStore((s) => s.updateSettings);
  const undoStore = useStore((s) => s.undo);
  const redoStore = useStore((s) => s.redo);
  const beginUndoBatch = useStore((s) => s.beginUndoBatch);
  const endUndoBatch = useStore((s) => s.endUndoBatch);
  const undoCount = useStore((s) => s.undoStack.length);
  const redoCount = useStore((s) => s.redoStack.length);
  const lastToast = useStore((s) => s.lastToast);

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [view, setView] = useState<ViewMode>('day');
  // Timeline zoom persists in Settings (48..240dp hour height).
  const savedHourHeight = useStore((s) => s.settings.calendarHourHeight ?? 64);
  const [hourHeight, setHourHeight] = useState(savedHourHeight);
  const [nowMin, setNowMin] = useState(() => nowMinutes());
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const [selected, setSelected] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardItem[]>([]);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragCtx, setDragCtx] = useState<{ id: string; date: string; durationMin: number } | null>(null);
  const [resizeCtx, setResizeCtx] = useState<{ id: string; date: string } | null>(null);
  const [magnetEdges, setMagnetEdges] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickSheet | null>(null);
  // Detail peek: tap any block (even a tiny one) to see everything about it.
  const [detail, setDetail] = useState<{ block: Block; date: string } | null>(null);
  const [qcTitle, setQcTitle] = useState('');
  const [qcDoNotNudge, setQcDoNotNudge] = useState(false);
  // Whether the user manually flipped the nudge switch in the open sheet.
  // Until they do, the switch follows the Do-not-nudge defaults for the
  // selected category (create mode only).
  const [qcNudgeDirty, setQcNudgeDirty] = useState(false);
  const [qcCategoryId, setQcCategoryId] = useState(DEFAULT_CATEGORIES[0].id);
  const [qcDuration, setQcDuration] = useState(DEFAULT_DURATION_MIN);
  // Pending change: the gesture is done, the scope sheet is asking which
  // scope to apply it with. Dismissing the sheet cancels the change.
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [scopeMore, setScopeMore] = useState(false);
  const [lastScope, setLastScope] = useState<Scope>('today');
  const [swapSheet, setSwapSheet] = useState<SwapSheet | null>(null);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [templateTarget, setTemplateTarget] = useState<'day' | 'visible'>('day');

  // Categories for the dock / quick sheet: store first, defaults until
  // the store hydrates.
  const cats = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  const hourHeightRef = useRef(hourHeight);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auto-scroll while dragging near the grid's top/bottom edge.
  const scrollYRef = useRef(0);
  const viewportHRef = useRef(0);
  const lastAutoScrollRef = useRef(0);
  // Guards applyTemplate against a double-tap: without it, two overlapping
  // applies would nest into one undo batch and one Undo would revert both.
  const applyingTemplate = useRef(false);
  // Live hour height (UI thread): the pinch writes this every frame and
  // the grid (rows, now-line, blocks, container height) reads it on the
  // UI thread — no setState during a pinch, so no re-render per frame.
  // React state commits only on pinch end (commitZoom); this effect then
  // snaps the shared value to the rounded, persisted value.
  const hourHeightSV = useSharedValue(savedHourHeight);
  // Hour height at pinch start (the scale multiplies from here).
  const pinchBaseH = useSharedValue(savedHourHeight);

  useEffect(() => {
    hourHeightSV.value = hourHeight;
  }, [hourHeight, hourHeightSV]);

  // Day-change slide: the grid translates horizontally so a day change
  // feels like a snappy page turn instead of a jump. dayShiftX is 0 at
  // rest; the two-finger swipe drives it with the finger, and every
  // anchor change slides the new day in from the direction of travel
  // (see the anchor effect below).
  const dayShiftX = useSharedValue(0);
  const gridShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dayShiftX.value }],
  }));

  useEffect(() => {
    hourHeightRef.current = hourHeight;
  }, [hourHeight]);

  // Follow the persisted zoom (e.g. after a restore); local pinch/button
  // changes commit through commitZoom below.
  useEffect(() => {
    setHourHeight(savedHourHeight);
  }, [savedHourHeight]);

  const commitZoom = useCallback(
    (v: number) => {
      const next = clamp(Math.round(v / 2) * 2, MIN_HOUR_H, MAX_HOUR_H);
      setHourHeight(next);
      void updateSettings({ calendarHourHeight: next });
    },
    [updateSettings],
  );

  // Nudge the grid while a drag/resize ghost approaches its top/bottom edge.
  const autoScrollFor = useCallback((topMin: number, bottomMin: number) => {
    const now = Date.now();
    if (now - lastAutoScrollRef.current < 120) return;
    const topPx = (topMin / 60) * hourHeightRef.current;
    const bottomPx = (bottomMin / 60) * hourHeightRef.current;
    const y = scrollYRef.current;
    const vh = viewportHRef.current;
    if (vh <= 0) return;
    if (topPx < y + 80) {
      lastAutoScrollRef.current = now;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 48), animated: true });
    } else if (bottomPx > y + vh - 80) {
      lastAutoScrollRef.current = now;
      scrollRef.current?.scrollTo({ y: y + 48, animated: true });
    }
  }, []);

  // Hydrate the store once (the root layout also loads it).
  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  useEffect(() => {
    const t = setInterval(() => setNowMin(nowMinutes()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Store toasts (every store mutation emits one) surface here too.
  // Read via lastToast rather than setToastHandler so this screen does
  // not clobber the Today screen's handler — both tabs stay mounted.
  useEffect(() => {
    if (!lastToast) return;
    showToast(lastToast);
  }, [lastToast, showToast]);

  const visibleDates = useCallback((): Date[] => {
    if (view === 'day') return [anchor];
    if (view === '3day') return [anchor, addDays(anchor, 1), addDays(anchor, 2)];
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, view])();

  const colW = (width - GUTTER) / visibleDates.length;
  const anchorKey = dateKey(anchor);
  const todayKey = dateKey(new Date());
  const selecting = selected.length > 0;

  // Land on "now" every time the Calendar tab opens — the old effect
  // ran once on mount (when the user was still on Today, since tab
  // screens stay mounted), so the grid sat at the start of the day.
  // Only when viewing today: another day keeps its own place. The
  // scroll fires on focus (three passes, in case the layout lags) AND
  // when the content size is first known, and the flag resets on blur
  // so it re-lands every time the tab opens.
  const scrolledToNowRef = useRef(false);
  const scrollToNow = useCallback(() => {
    if (anchorKey !== todayKey) return;
    const ref = scrollRef.current;
    if (!ref) return;
    const target = Math.max(0, (nowMinutes() / 60 - 1.5) * hourHeightRef.current);
    ref.scrollTo({ y: target, animated: false });
    scrolledToNowRef.current = true;
  }, [anchorKey, todayKey]);

  useFocusEffect(
    useCallback(() => {
      scrolledToNowRef.current = false;
      const t1 = setTimeout(scrollToNow, 150);
      const t2 = setTimeout(scrollToNow, 500);
      const t3 = setTimeout(scrollToNow, 1200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        scrolledToNowRef.current = false;
      };
    }, [scrollToNow]),
  );

  // Slide the new day in from the direction of travel whenever the
  // anchor changes (buttons, date strip, Today, two-finger swipe).
  // The grid is off-screen on the far side while the dates swap, so
  // the user sees one continuous page turn, not a jump. Skipped on
  // mount (no previous anchor).
  const prevAnchorKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevAnchorKeyRef.current;
    prevAnchorKeyRef.current = anchorKey;
    if (!prev || prev === anchorKey) return;
    const dir = anchorKey > prev ? 1 : -1;
    dayShiftX.value = dir * width;
    dayShiftX.value = withTiming(0, { duration: 250, easing: DECEL });
  }, [anchorKey, dayShiftX, width]);

  const stepSize = view === 'day' ? 1 : view === '3day' ? 3 : 7;
  const step = useCallback(
    (dir: number) => setAnchor((a) => addDays(a, dir * stepSize)),
    [stepSize],
  );

  const findBlock = useCallback(
    (id: string): { block: Block; date: string } | null => {
      for (const d of visibleDates) {
        const key = dateKey(d);
        const b = getBlocksForDate(key).find((x) => x.id === id);
        if (b) return { block: b, date: key };
      }
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleDates, templates, dayOverrides],
  );

  // Every mutating change asks scope first, then runs against the store.
  const requestScope = useCallback(
    (description: string, run: (scope: Scope) => Promise<void>) => {
      setScopeMore(false);
      setPending({ description, run });
    },
    [],
  );

  const confirmScope = useCallback(
    (scope: Scope) => {
      const p = pending;
      setPending(null);
      setLastScope(scope);
      if (p) {
        // A throw inside the run (e.g. a sqlite failure on the 2nd of N
        // pasted blocks) must not vanish: the batch finally-blocks already
        // ran, so say what happened instead of failing silently.
        void p.run(scope).catch(() => {
          showToast('Something went wrong — the change may not have been applied');
        });
      }
    },
    [pending, showToast],
  );

  const cancelPending = useCallback(() => {
    setPending(null);
    showToast('Change cancelled');
  }, [showToast]);

  /**
   * Apply a locally computed auto-shift result to the store. The primary
   * block moves/resizes with the chosen scope; neighbours that got pushed
   * only ever shift for today, so their template recurrences (and ids)
   * are untouched. The whole gesture is one undo entry (store undo batch).
   */
  const applyShift = useCallback(
    async (
      date: string,
      before: Block[],
      shifted: Block[],
      primaryId: string,
      scope: Scope,
    ) => {
      beginUndoBatch();
      try {
        const primaryBefore = before.find((b) => b.id === primaryId);
        const primaryAfter = shifted.find((b) => b.id === primaryId);
        if (primaryBefore && primaryAfter) {
          if (primaryAfter.startMin !== primaryBefore.startMin) {
            await moveBlock(primaryId, date, primaryAfter.startMin, scope);
          }
          if (primaryAfter.durationMin !== primaryBefore.durationMin) {
            await resizeBlock(primaryId, date, primaryAfter.durationMin, scope);
          }
        }
        for (const b of shifted) {
          if (b.id === primaryId) continue;
          const orig = before.find((x) => x.id === b.id);
          if (orig && orig.startMin !== b.startMin) {
            await moveBlock(b.id, date, b.startMin, 'today');
          }
        }
      } finally {
        endUndoBatch();
      }
    },
    [moveBlock, resizeBlock, beginUndoBatch, endUndoBatch],
  );

  /** Add a new block (from a locally computed shifted list) + shift neighbours.
   * Opens its own undo batch, so a single create is one undo entry — and
   * multi-block callers (duplicate / paste / apply-template) wrap the whole
   * loop in an outer batch, which nests harmlessly (depth counter; the
   * snapshot is taken lazily on the first mutation inside the batch),
   * making the whole user action one entry. */
  const applyCreated = useCallback(
    async (
      date: string,
      before: Block[],
      shifted: Block[],
      createdId: string,
      scope: Scope,
    ) => {
      const created = shifted.find((b) => b.id === createdId);
      if (!created) return;
      beginUndoBatch();
      try {
        await addBlock(created, date, scope);
        for (const b of shifted) {
          if (b.id === createdId) continue;
          const orig = before.find((x) => x.id === b.id);
          if (orig && orig.startMin !== b.startMin) {
            await moveBlock(b.id, date, b.startMin, 'today');
          }
        }
      } finally {
        endUndoBatch();
      }
    },
    [addBlock, moveBlock, beginUndoBatch, endUndoBatch],
  );

  const undo = useCallback(() => {
    void undoStore();
  }, [undoStore]);

  const redo = useCallback(() => {
    void redoStore();
  }, [redoStore]);

  // ---- drag / resize -------------------------------------------------
  const handleDragStart = useCallback(
    (id: string) => {
      const found = findBlock(id);
      if (!found) return;
      setDragId(id);
      setDragCtx({ id, date: found.date, durationMin: found.block.durationMin });
      const others = getBlocksForDate(found.date).filter((b) => b.id !== id);
      setMagnetEdges(
        others.flatMap((b) => [b.startMin, b.startMin + b.durationMin - found.block.durationMin]),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findBlock, templates, dayOverrides],
  );

  const handleDragPreview = useCallback(
    (id: string, startMin: number) => {
      setGhost((g) => {
        if (!dragCtx || dragCtx.id !== id) return g;
        return { blockId: id, date: dragCtx.date, startMin, durationMin: dragCtx.durationMin };
      });
      autoScrollFor(startMin, startMin + (dragCtx?.durationMin ?? 0));
    },
    [dragCtx, autoScrollFor],
  );

  const handleDragEnd = useCallback(
    (id: string, snappedStart: number) => {
      const ctx = dragCtx;
      setGhost(null);
      setDragId(null);
      setDragCtx(null);
      setMagnetEdges([]);
      if (!ctx || ctx.id !== id) return;
      const list = getBlocksForDate(ctx.date);
      const orig = list.find((b) => b.id === id);
      if (!orig) return;
      const moved: Block = { ...orig, startMin: clamp(snap5(snappedStart), 0, 24 * 60 - orig.durationMin) };
      if (moved.startMin === orig.startMin) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const shifted = autoShiftBlocks(list, moved);
      if (!shifted) {
        const conflict = list.find((b) => b.id !== id && overlaps(moved, b));
        if (conflict) {
          setSwapSheet({ moved, origStart: orig.startMin, date: ctx.date, conflict });
        } else {
          showToast('No room to move there');
        }
        return;
      }
      requestScope(`Moved "${moved.title}"`, (scope) =>
        applyShift(ctx.date, list, shifted, id, scope),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragCtx, applyShift, requestScope, showToast, templates, dayOverrides],
  );

  const handleResizeStart = useCallback(
    (id: string) => {
      const found = findBlock(id);
      if (!found) return;
      setResizeCtx({ id, date: found.date });
      setDragId(id);
    },
    [findBlock],
  );

  const handleResizePreview = useCallback(
    (id: string, durationMin: number) => {
      setGhost((g) => {
        if (!resizeCtx || resizeCtx.id !== id) return g;
        const found = findBlock(id);
        if (!found) return g;
        return { blockId: id, date: found.date, startMin: found.block.startMin, durationMin };
      });
      const found = findBlock(id);
      if (found) autoScrollFor(found.block.startMin, found.block.startMin + durationMin);
    },
    [resizeCtx, findBlock, autoScrollFor],
  );

  const handleResizeEnd = useCallback(
    (id: string, durationMin: number) => {
      const ctx = resizeCtx;
      setGhost(null);
      setDragId(null);
      setResizeCtx(null);
      if (!ctx || ctx.id !== id) return;
      const list = getBlocksForDate(ctx.date);
      const orig = list.find((b) => b.id === id);
      if (!orig || durationMin === orig.durationMin) return;
      const moved: Block = { ...orig, durationMin };
      const shifted = autoShiftBlocks(list, moved);
      if (!shifted) {
        showToast('No room to grow here — neighbours are in the way');
        return;
      }
      requestScope(`Resized "${moved.title}"`, (scope) =>
        applyShift(ctx.date, list, shifted, id, scope),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resizeCtx, applyShift, requestScope, showToast, templates, dayOverrides],
  );

  const handleDragCancel = useCallback(() => {
    setGhost(null);
    setDragId(null);
    setDragCtx(null);
    setResizeCtx(null);
    setMagnetEdges([]);
    setScrollEnabled(true);
  }, []);

  // ---- top resize (drag the top edge: start moves, duration follows) ---
  const handleResizeTopStart = useCallback(
    (id: string) => {
      const found = findBlock(id);
      if (!found) return;
      setResizeCtx({ id, date: found.date });
      setDragId(id);
    },
    [findBlock],
  );

  const handleResizeTopPreview = useCallback(
    (id: string, startMin: number, durationMin: number) => {
      setGhost((g) => {
        if (!resizeCtx || resizeCtx.id !== id) return g;
        const found = findBlock(id);
        if (!found) return g;
        return { blockId: id, date: found.date, startMin, durationMin };
      });
      autoScrollFor(startMin, startMin + durationMin);
    },
    [resizeCtx, findBlock, autoScrollFor],
  );

  const handleResizeTopEnd = useCallback(
    (id: string, startMin: number, durationMin: number) => {
      const ctx = resizeCtx;
      setGhost(null);
      setDragId(null);
      setResizeCtx(null);
      if (!ctx || ctx.id !== id) return;
      const list = getBlocksForDate(ctx.date);
      const orig = list.find((b) => b.id === id);
      if (!orig || (startMin === orig.startMin && durationMin === orig.durationMin)) return;
      const moved: Block = { ...orig, startMin: snap5(startMin), durationMin };
      const shifted = autoShiftBlocks(list, moved);
      if (!shifted) {
        showToast('No room to grow here — neighbours are in the way');
        return;
      }
      requestScope(`Resized "${moved.title}"`, (scope) =>
        applyShift(ctx.date, list, shifted, id, scope),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resizeCtx, applyShift, requestScope, showToast, templates, dayOverrides],
  );

  // ---- select / tap --------------------------------------------------
  const handleTapBlock = useCallback(
    (id: string) => {
      if (selecting) {
        setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
        return;
      }
      // Tap opens the detail peek (never the editor directly): even a tiny
      // block's full title, time, notes and actions are one tap away.
      const found = findBlock(id);
      if (found) setDetail({ block: found.block, date: found.date });
    },
    [selecting, findBlock],
  );

  // Detail-peek actions ------------------------------------------------
  const duplicateDetailBlock = useCallback(() => {
    if (!detail) return;
    const { block, date } = detail;
    setDetail(null);
    requestScope(`Duplicated "${block.title}"`, async (scope) => {
      const list = getBlocksForDate(date);
      const copy: Block = {
        ...block,
        id: newId(),
        title: `${block.title} (copy)`,
        startMin: block.startMin + block.durationMin,
      };
      let merged = autoShiftBlocks(list, copy);
      if (!merged) {
        const slot = earliestEmptySlot(list, block.startMin + block.durationMin, copy.durationMin);
        if (slot === null) {
          showToast('No room to duplicate');
          return;
        }
        merged = autoShiftBlocks(list, { ...copy, startMin: slot });
      }
      if (!merged) {
        showToast('No room to duplicate');
        return;
      }
      beginUndoBatch();
      try {
        await applyCreated(date, list, merged, copy.id, scope);
      } finally {
        endUndoBatch();
      }
    });
  }, [detail, requestScope, applyCreated, showToast, beginUndoBatch, endUndoBatch]);

  const deleteDetailBlock = useCallback(() => {
    if (!detail) return;
    const { block, date } = detail;
    setDetail(null);
    requestScope(`Deleted "${block.title}"`, (scope) => deleteBlock(block.id, date, scope));
  }, [detail, requestScope, deleteBlock]);

  const markDetailDone = useCallback(() => {
    if (!detail) return;
    const { block, date } = detail;
    setDetail(null);
    void markDone(block.id, date);
  }, [detail, markDone]);

  const openCreate = useCallback((date: string, startMin: number) => {
    setQcTitle('');
    setQcCategoryId(DEFAULT_CATEGORIES[0].id);
    setQcDuration(DEFAULT_DURATION_MIN);
    // New blocks start silenced when a Do-not-nudge default covers them.
    setQcDoNotNudge(
      defaultDoNotNudgeFor(
        useStore.getState().settings,
        DEFAULT_CATEGORIES[0].id,
      ),
    );
    setQcNudgeDirty(false);
    setQuick({ mode: 'create', date, startMin });
  }, []);

  const openEdit = useCallback((block: Block, date: string) => {
    setQcTitle(block.title);
    setQcCategoryId(block.categoryId);
    setQcDuration(block.durationMin);
    setQcDoNotNudge(block.doNotNudge ?? false);
    setQcNudgeDirty(false);
    setQuick({ mode: 'edit', date, block });
  }, []);

  // Picking a category in create mode re-derives the nudge switch from the
  // defaults for that category — unless the user already flipped it by
  // hand, in which case their explicit choice stands. In edit mode the
  // switch keeps the block's own flag (re-categorising never re-evaluates
  // the defaults).
  const selectQcCategory = useCallback(
    (categoryId: string) => {
      setQcCategoryId(categoryId);
      if (quick?.mode === 'create' && !qcNudgeDirty) {
        setQcDoNotNudge(
          defaultDoNotNudgeFor(useStore.getState().settings, categoryId),
        );
      }
    },
    [quick, qcNudgeDirty],
  );

  const handleBackgroundLongPress = useCallback(
    (x: number, y: number) => {
      const colIdx = clamp(Math.floor((x - GUTTER) / colW), 0, visibleDates.length - 1);
      const date = dateKey(visibleDates[colIdx]);
      const startMin = clamp(Math.floor((y / hourHeightRef.current) * 60 / 5) * 5, 0, 24 * 60 - 25);
      const list = getBlocksForDate(date);
      const hit = list.some((b) => startMin >= b.startMin && startMin < b.startMin + b.durationMin);
      if (hit) return; // block's own long-press handles it
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      openCreate(date, startMin);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colW, visibleDates, openCreate, templates, dayOverrides],
  );

  // ---- quick create / edit sheet -------------------------------------
  const saveQuick = useCallback(() => {
    if (!quick) return;
    const title = qcTitle.trim() || categoryById(qcCategoryId, categories).name;
    if (quick.mode === 'create') {
      const block: Block = {
        id: newId(),
        categoryId: qcCategoryId,
        title,
        startMin: quick.startMin,
        durationMin: qcDuration,
        // Explicit: the sheet switch wins over the Do-not-nudge defaults.
        doNotNudge: qcDoNotNudge,
      };
      const list = getBlocksForDate(quick.date);
      const merged = autoShiftBlocks(list, block);
      if (!merged) {
        showToast('That slot is full — pick another time');
        return;
      }
      const date = quick.date;
      setQuick(null);
      requestScope(`Created "${title}"`, (scope) =>
        applyCreated(date, list, merged, block.id, scope),
      );
      return;
    }
    const updated: Block = {
      ...quick.block,
      categoryId: qcCategoryId,
      title,
      durationMin: qcDuration,
    };
    const list = getBlocksForDate(quick.date);
    const merged = autoShiftBlocks(list, updated);
    if (!merged) {
      showToast('No room for that size here');
      return;
    }
    const date = quick.date;
    const orig = quick.block;
    setQuick(null);
    requestScope(`Edited "${title}"`, async (scope) => {
      // Category / title go through patchBlock; a duration change goes
      // through resizeBlock (which also shifts neighbours via applyShift
      // semantics below). A weekday-scope split keeps the block id, so the
      // resize uses the same id. The whole edit is one undo entry.
      const patch: Partial<
        Pick<Block, 'categoryId' | 'subcategoryId' | 'title' | 'notes' | 'doNotNudge' | 'alarmMode'>
      > = {};
      if (updated.categoryId !== orig.categoryId) patch.categoryId = updated.categoryId;
      if (updated.title !== orig.title) patch.title = updated.title;
      if ((orig.doNotNudge ?? false) !== qcDoNotNudge) patch.doNotNudge = qcDoNotNudge;
      beginUndoBatch();
      try {
        if (Object.keys(patch).length > 0) {
          await patchBlock(orig.id, date, patch, scope);
        }
        const mergedBlock = merged.find((b) => b.id === orig.id);
        if (mergedBlock && mergedBlock.durationMin !== orig.durationMin) {
          await resizeBlock(orig.id, date, mergedBlock.durationMin, scope);
        }
        for (const b of merged) {
          if (b.id === orig.id) continue;
          const before = list.find((x) => x.id === b.id);
          if (before && before.startMin !== b.startMin) {
            await moveBlock(b.id, date, b.startMin, 'today');
          }
        }
      } finally {
        endUndoBatch();
      }
    });
  }, [quick, qcTitle, qcCategoryId, qcDuration, qcDoNotNudge, requestScope, applyCreated, patchBlock, resizeBlock, moveBlock, showToast, templates, dayOverrides, beginUndoBatch, endUndoBatch]);

  const deleteQuickBlock = useCallback(() => {
    if (!quick || quick.mode !== 'edit') return;
    const { id, title } = quick.block;
    const date = quick.date;
    setQuick(null);
    requestScope(`Deleted "${title}"`, (scope) => deleteBlock(id, date, scope));
  }, [quick, requestScope, deleteBlock]);

  // ---- multi-select actions ------------------------------------------
  // Duplicate preserves the original block as-is, including its explicit
  // doNotNudge flag: a copy is that block again, so an explicit flag wins
  // over the current defaults (same rule as addBlock). Paste drops the flag
  // (ClipboardItem has none), so pasted blocks take the current defaults.
  const duplicateSelected = useCallback(() => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSelected([]);
    requestScope(`Duplicated ${ids.length} block${ids.length > 1 ? 's' : ''}`, async (scope) => {
      let added = 0;
      // One undo entry for the whole duplicate action, not one per block:
      // applyCreated's own batch nests inside this outer one.
      beginUndoBatch();
      try {
        for (const id of ids) {
          const found = findBlock(id);
          if (!found) continue;
          const list = getBlocksForDate(found.date);
          const copy: Block = {
            ...found.block,
            id: newId(),
            title: `${found.block.title} (copy)`,
            startMin: found.block.startMin + found.block.durationMin,
          };
          let merged = autoShiftBlocks(list, copy);
          if (!merged) {
            const slot = earliestEmptySlot(list, found.block.startMin + found.block.durationMin, copy.durationMin);
            if (slot === null) continue;
            merged = autoShiftBlocks(list, { ...copy, startMin: slot });
          }
          if (!merged) continue;
          await applyCreated(found.date, list, merged, copy.id, scope);
          added += 1;
        }
      } finally {
        endUndoBatch();
      }
      if (added === 0) showToast('No room to duplicate');
    });
  }, [selected, findBlock, requestScope, applyCreated, showToast, templates, dayOverrides, beginUndoBatch, endUndoBatch]);

  const copySelected = useCallback(() => {
    const items: ClipboardItem[] = [];
    for (const id of selected) {
      const found = findBlock(id);
      if (found) {
        items.push({
          categoryId: found.block.categoryId,
          title: found.block.title,
          startMin: found.block.startMin,
          durationMin: found.block.durationMin,
        });
      }
    }
    if (items.length === 0) return;
    setClipboard(items);
    setSelected([]);
    showToast(`Copied ${items.length} block${items.length > 1 ? 's' : ''} — paste to another day`);
  }, [selected, findBlock, showToast]);

  const pasteClipboard = useCallback(() => {
    if (clipboard.length === 0) return;
    const items = [...clipboard];
    const date = anchorKey;
    requestScope(`Pasted ${items.length} block${items.length > 1 ? 's' : ''}`, async (scope) => {
      let added = 0;
      let skipped = 0;
      // One undo entry for the whole paste, not one per block (see above).
      beginUndoBatch();
      try {
        for (const item of items) {
          const list = getBlocksForDate(date);
          const block: Block = { ...item, id: newId() };
          const merged = autoShiftBlocks(list, block);
          if (!merged) {
            skipped += 1;
            continue;
          }
          await applyCreated(date, list, merged, block.id, scope);
          added += 1;
        }
      } finally {
        endUndoBatch();
      }
      if (added === 0) {
        showToast('No room to paste here');
      } else if (skipped > 0) {
        showToast(`Pasted ${added} block${added > 1 ? 's' : ''} (${skipped} skipped)`);
      }
    });
  }, [clipboard, anchorKey, requestScope, applyCreated, showToast, templates, dayOverrides, beginUndoBatch, endUndoBatch]);

  const deleteSelected = useCallback(() => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSelected([]);
    requestScope(`Deleted ${ids.length} block${ids.length > 1 ? 's' : ''}`, async (scope) => {
      beginUndoBatch();
      try {
        for (const id of ids) {
          const found = findBlock(id);
          if (found) await deleteBlock(id, found.date, scope);
        }
      } finally {
        endUndoBatch();
      }
    });
  }, [selected, findBlock, requestScope, deleteBlock, beginUndoBatch, endUndoBatch]);

  // ---- swap ------------------------------------------------------------
  const doSwap = useCallback(() => {
    if (!swapSheet) return;
    const { moved, origStart, date, conflict } = swapSheet;
    const list = getBlocksForDate(date);
    const swapped: Block[] = list.map((b) =>
      b.id === moved.id ? moved : b.id === conflict.id ? { ...conflict, startMin: origStart } : b,
    );
    const clash = swapped.some(
      (a) => swapped.some((b) => b.id !== a.id && overlaps(a, b)),
    );
    if (clash) {
      setSwapSheet(null);
      showToast('Swap still clashes — move cancelled');
      return;
    }
    setSwapSheet(null);
    requestScope(`Swapped "${moved.title}" with "${conflict.title}"`, async (scope) => {
      beginUndoBatch();
      try {
        await moveBlock(moved.id, date, moved.startMin, scope);
        await moveBlock(conflict.id, date, origStart, scope);
      } finally {
        endUndoBatch();
      }
    });
  }, [swapSheet, requestScope, moveBlock, showToast, templates, dayOverrides, beginUndoBatch, endUndoBatch]);

  // ---- templates ---------------------------------------------------------
  // A routine fills days with one-off blocks (scope 'today' per day), so
  // applying a template never rewrites the user's recurring routine.
  const applyTemplate = useCallback(
    async (tpl: RoutineTemplateDef) => {
      if (applyingTemplate.current) {
        showToast('Template is already applying');
        return;
      }
      applyingTemplate.current = true;
      try {
        const targets =
          templateTarget === 'day'
            ? [anchorKey]
            : visibleDates.map((d) => dateKey(d));
        let added = 0;
        let skipped = 0;
        // One undo entry for the whole template application — it can add many
        // blocks across several days, and one Undo must revert all of them.
        beginUndoBatch();
        try {
          for (const date of targets) {
            let list = getBlocksForDate(date);
            for (const t of tpl.blocks) {
              const block: Block = { id: newId(), categoryId: t.categoryId, title: t.title, startMin: t.startMin, durationMin: t.durationMin };
              const merged = autoShiftBlocks(list, block);
              if (!merged) {
                skipped += 1;
                continue;
              }
              await applyCreated(date, list, merged, block.id, 'today');
              list = getBlocksForDate(date);
              added += 1;
            }
          }
        } finally {
          endUndoBatch();
        }
        setTemplateSheet(false);
        if (added === 0) {
          showToast('No room to apply this template');
        } else if (skipped > 0) {
          showToast(`Applied "${tpl.name}" (${skipped} skipped)`);
        }
      } finally {
        applyingTemplate.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateTarget, anchorKey, visibleDates, applyCreated, showToast, templates, dayOverrides, beginUndoBatch, endUndoBatch],
  );

  // ---- dock (real Dock.tsx) ----------------------------------------------
  // Dropping a node onto the grid creates the block at the drop position
  // (column = day, y = start time). A drop outside the grid falls back to
  // the earliest free slot, same as the old tap-to-add behaviour.
  const dockCreateEarliest = useCallback(
    (cat: Category, subcategoryId?: string) => {
      const list = getBlocksForDate(anchorKey);
      const fromMin = anchorKey === todayKey ? nowMin : 0;
      const slot = earliestEmptySlot(list, fromMin, DEFAULT_DURATION_MIN);
      if (slot === null) {
        showToast('No empty 25-min slot left today');
        return;
      }
      const sub = cat.subcategories?.find((s) => s.id === subcategoryId);
      const block: Block = {
        id: newId(),
        categoryId: cat.id,
        subcategoryId,
        title: sub?.name ?? cat.name,
        startMin: slot,
        durationMin: DEFAULT_DURATION_MIN,
      };
      const merged = autoShiftBlocks(list, block) ?? [...list, block].sort((a, b) => a.startMin - b.startMin);
      requestScope(`Added ${cat.name} at ${minToTime(slot)}`, (scope) =>
        applyCreated(anchorKey, list, merged, block.id, scope),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchorKey, todayKey, nowMin, requestScope, applyCreated, showToast, templates, dayOverrides],
  );

  const handleDockDrop = useCallback(
    (category: Category, x: number, y: number, subcategoryId?: string) => {
      const node = gridRef.current;
      if (!node) {
        dockCreateEarliest(category, subcategoryId);
        return;
      }
      node.measure((_mx, _my, _w, _h, pageX, pageY) => {
        const localX = x - pageX;
        const localY = y - pageY;
        const colIdx = Math.floor((localX - GUTTER) / colW);
        const startMin = clamp(
          Math.floor((localY / hourHeightRef.current) * 60 / 5) * 5,
          0,
          24 * 60 - DEFAULT_DURATION_MIN,
        );
        if (
          colIdx < 0 ||
          colIdx >= visibleDates.length ||
          localY < 0 ||
          localY > HOURS * hourHeightRef.current
        ) {
          dockCreateEarliest(category, subcategoryId);
          return;
        }
        const date = dateKey(visibleDates[colIdx]);
        const list = getBlocksForDate(date);
        const sub = category.subcategories?.find((s) => s.id === subcategoryId);
        const block: Block = {
          id: newId(),
          categoryId: category.id,
          subcategoryId,
          title: sub?.name ?? category.name,
          startMin,
          durationMin: DEFAULT_DURATION_MIN,
        };
        const merged = autoShiftBlocks(list, block);
        if (!merged) {
          showToast('That slot is full — pick another time');
          return;
        }
        requestScope(
          `Added ${sub?.name ?? category.name} at ${minToTime(block.startMin)}`,
          (scope) => applyCreated(date, list, merged, block.id, scope),
        );
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colW, visibleDates, dockCreateEarliest, requestScope, applyCreated, showToast, templates, dayOverrides],
  );

  // Radial quick-add (one continuous touch — hold, slide, hover 300ms,
  // drag, release): the hook owns the hover / dwell / attach machine;
  // dropping at the finger's position creates the block there (same as a
  // direct dock drop), falling back to the earliest slot outside the grid.
  const radialGhostX = useSharedValue(0);
  const radialGhostY = useSharedValue(0);
  const radial = useRadialDrag({
    onCreate: (category, subcategoryId, x, y) => handleDockDrop(category, x, y, subcategoryId),
    onDrop: (category, subcategoryId, x, y) => handleDockDrop(category, x, y, subcategoryId),
    onDragMove: (x, y) => {
      radialGhostX.value = x;
      radialGhostY.value = y;
    },
  });
  const radialGhostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: radialGhostX.value - 56 },
      { translateY: radialGhostY.value - 28 },
    ],
  }));

  // ---- gestures: pinch zoom + two-finger day swipe -----------------------
  // The grid scrolls inside a native ScrollView. Without the native
  // gesture in the composition, the scroll view claims two-finger touches
  // for itself and the pinch never fires (reported on device 2026-11-10:
  // zoom did nothing). The native gesture lets the pinch, the two-finger
  // swipe and the native scroll run simultaneously: one finger scrolls,
  // two fingers pinch/swipe days. (Gesture.Native is deprecated in favour
  // of the v3 useNativeGesture hook, but that hook's type does not compose
  // with the v2 Gesture.Simultaneous used by this file and the rest of
  // the app; the deprecated call still works in the installed version.)
  const nativeScroll = Gesture.Native();
  // Smooth pinch: the gesture writes ONLY the shared value (continuous,
  // clamped, no rounding) and the grid reads it on the UI thread — the
  // old pinch called setHourHeight on every frame, re-rendering the whole
  // calendar per frame (plus a /2×2 rounding step), which is what made it
  // tacky. React state commits once, on pinch end, via commitZoom.
  const pinch = Gesture.Pinch()
    .onBegin(() => {
      pinchBaseH.value = hourHeightSV.value;
    })
    .onUpdate((e) => {
      hourHeightSV.value = clamp(pinchBaseH.value * e.scale, MIN_HOUR_H, MAX_HOUR_H);
    })
    .onEnd(() => {
      // Persist the zoom so tiny blocks stay readable next time.
      runOnJS(commitZoom)(hourHeightSV.value);
    });

  const twoFinger = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onUpdate((e) => {
      // Tactile: the grid follows the finger while swiping between days.
      dayShiftX.value = clamp(e.translationX, -width, width);
    })
    .onEnd((e) => {
      if (e.translationX < -60) {
        // Slide out left, then step to the next day — the anchor effect
        // slides the new day in from the right.
        dayShiftX.value = withTiming(-width, { duration: 150, easing: DECEL }, (finished) => {
          if (finished) runOnJS(step)(1);
        });
      } else if (e.translationX > 60) {
        dayShiftX.value = withTiming(width, { duration: 150, easing: DECEL }, (finished) => {
          if (finished) runOnJS(step)(-1);
        });
      } else {
        // Short swipe: snap back to the current day.
        dayShiftX.value = withTiming(0, { duration: 200, easing: DECEL });
      }
    });

  const outerGestures = Gesture.Simultaneous(pinch, twoFinger, nativeScroll);

  const backgroundLongPress = Gesture.LongPress()
    .minDuration(450)
    .onStart((e) => {
      runOnJS(handleBackgroundLongPress)(e.x, e.y);
    });

  // ---- render helpers ----------------------------------------------------
  const stripDates = Array.from({ length: 7 }, (_, i) => addDays(anchor, i - 3));
  // Grid + column-separator height, driven by the live hour height on
  // the UI thread (same shared value the pinch writes).
  const gridHeightStyle = useAnimatedStyle(() => ({ height: HOURS * hourHeightSV.value }));

  const renderHourRows = () => {
    const rows = [];
    for (let h = 0; h < HOURS; h++) {
      rows.push(<HourRow key={h} hourHeightSV={hourHeightSV} h={h} />);
    }
    return rows;
  };

  const renderBlocks = () =>
    visibleDates.map((date, colIdx) => {
      const key = dateKey(date);
      const list = getBlocksForDate(key);
      // Overlapping blocks share the column in side-by-side lanes, so a
      // tiny block never hides under a neighbour.
      return assignLanes(list).map(({ block, lane, laneCount }) => {
        const top = (block.startMin / 60) * hourHeight;
        const height = Math.max(28, (block.durationMin / 60) * hourHeight);
        const laneW = (colW - 8) / laneCount;
        return (
          <BlockCard
            key={`${key}-${block.id}`}
            block={block}
            top={top}
            left={GUTTER + colIdx * colW + 4 + lane * laneW}
            width={laneW - 2}
            height={height}
            hourHeightSV={hourHeightSV}
            magnetEdges={magnetEdges}
            selected={selected.includes(block.id)}
            onInteractionStart={() => setScrollEnabled(false)}
            onInteractionEnd={() => setScrollEnabled(true)}
            onDragStart={handleDragStart}
            onDragPreview={handleDragPreview}
            onDragEnd={handleDragEnd}
            onResizeStart={handleResizeStart}
            onResizePreview={handleResizePreview}
            onResizeEnd={handleResizeEnd}
            onResizeTopStart={handleResizeTopStart}
            onResizeTopPreview={handleResizeTopPreview}
            onResizeTopEnd={handleResizeTopEnd}
            onTapBlock={handleTapBlock}
            onDragCancel={handleDragCancel}
          />
        );
      });
    });

  const renderNowLine = () => {
    const colIdx = visibleDates.findIndex((d) => dateKey(d) === todayKey);
    if (colIdx < 0) return null;
    return (
      <NowLine
        hourHeightSV={hourHeightSV}
        nowMin={nowMin}
        left={GUTTER + colIdx * colW}
        width={colW}
      />
    );
  };

  const renderGhost = () => {
    if (!ghost) return null;
    const colIdx = visibleDates.findIndex((d) => dateKey(d) === ghost.date);
    if (colIdx < 0) return null;
    const top = (ghost.startMin / 60) * hourHeight;
    const height = Math.max(28, (ghost.durationMin / 60) * hourHeight);
    const category = categoryById(ghost.blockId ? (findBlock(ghost.blockId)?.block.categoryId ?? 'cat-custom') : 'cat-custom', categories);
    const bg = `${categoryColorHex[category.color]}66`;
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
        <View
          style={[
            styles.ghost,
            {
              top,
              left: GUTTER + colIdx * colW + 4,
              width: colW - 8,
              height,
              backgroundColor: bg,
            },
          ]}
        />
        <View
          style={[
            styles.tooltip,
            {
              top: Math.max(2, top - 30),
              left: clamp(GUTTER + colIdx * colW + 4, 4, width - 130),
            },
          ]}
        >
          <Text style={styles.tooltipText}>
            {minToTime(ghost.startMin)} – {minToTime(ghost.startMin + ghost.durationMin)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.monthTitle}>
            {MONTHS[anchor.getMonth()]} {anchor.getFullYear()}
          </Text>
          <View style={styles.headerActions}>
            <Pressable onPress={undo} disabled={undoCount === 0} style={styles.iconBtn}>
              <Text style={[styles.iconBtnText, undoCount === 0 && styles.disabledText]}>Undo</Text>
            </Pressable>
            <Pressable onPress={redo} disabled={redoCount === 0} style={styles.iconBtn}>
              <Text style={[styles.iconBtnText, redoCount === 0 && styles.disabledText]}>Redo</Text>
            </Pressable>
            <Pressable onPress={() => setAnchor(new Date())} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>Today</Text>
            </Pressable>
          </View>
        </View>

        {/* View switcher + prev/next */}
        <View style={styles.controlsRow}>
          <Pressable onPress={() => step(-1)} style={styles.navBtn} accessibilityLabel="Previous">
            <Text style={styles.navBtnText}>‹</Text>
          </Pressable>
          <View style={styles.segmented}>
            {(['day', '3day', 'week'] as ViewMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setView(m)}
                style={[styles.segment, view === m && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, view === m && styles.segmentTextActive]}>
                  {m === 'day' ? 'Day' : m === '3day' ? '3-Day' : 'Week'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => step(1)} style={styles.navBtn} accessibilityLabel="Next">
            <Text style={styles.navBtnText}>›</Text>
          </Pressable>
          <Pressable onPress={() => setTemplateSheet(true)} style={styles.applyBtn}>
            <Text style={styles.applyBtnText}>Apply to…</Text>
          </Pressable>
          {clipboard.length > 0 && (
            <Pressable onPress={pasteClipboard} style={styles.pasteBtn}>
              <Text style={styles.pasteBtnText}>Paste ({clipboard.length})</Text>
            </Pressable>
          )}
        </View>

        {/* Date strip */}
        <View style={styles.strip}>
          {stripDates.map((d) => {
            const key = dateKey(d);
            const isAnchor = key === anchorKey;
            const isToday = key === todayKey;
            return (
              <Pressable key={key} onPress={() => setAnchor(d)} style={styles.stripItem}>
                <Text style={styles.stripWeekday}>{WEEKDAYS[d.getDay()].toUpperCase()}</Text>
                <View style={[styles.stripDay, isAnchor && styles.stripDayActive, isToday && !isAnchor && styles.stripDayToday]}>
                  <Text style={[styles.stripDayText, isAnchor && styles.stripDayTextActive]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Hour grid */}
        <GestureDetector gesture={outerGestures}>
          <ScrollScreen
            scrollRef={scrollRef}
            style={styles.gridScroll}
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            onLayout={(e) => {
              viewportHRef.current = e.nativeEvent.layout.height;
            }}
            onContentSizeChange={() => {
              // Content laid out: land on now if this focus session
              // hasn't yet (the focus timers may have fired too early).
              if (!scrolledToNowRef.current) scrollToNow();
            }}
          >
            <GestureDetector gesture={backgroundLongPress}>
              <Animated.View ref={gridRef} style={[{ width: width }, gridHeightStyle, gridShiftStyle]}>
                {renderHourRows()}
                {visibleDates.map((_, i) => (
                  <Animated.View
                    key={`sep-${i}`}
                    pointerEvents="none"
                    style={[styles.colSep, { left: GUTTER + i * colW }, gridHeightStyle]}
                  />
                ))}
                {renderBlocks()}
                {renderNowLine()}
                {renderGhost()}
              </Animated.View>
            </GestureDetector>
          </ScrollScreen>
        </GestureDetector>

        {/* Multi-select bar */}
        {selecting && (
          <View style={[styles.selectBar, { marginBottom: bottomInset }]}>
            <Text style={styles.selectCount}>{selected.length} selected</Text>
            <Pressable onPress={duplicateSelected} style={styles.selectAction}>
              <Text style={styles.selectActionText}>Duplicate</Text>
            </Pressable>
            <Pressable onPress={copySelected} style={styles.selectAction}>
              <Text style={styles.selectActionText}>Copy</Text>
            </Pressable>
            <Pressable onPress={deleteSelected} style={[styles.selectAction, styles.selectDelete]}>
              <Text style={styles.selectActionText}>Delete</Text>
            </Pressable>
            <Pressable onPress={() => setSelected([])} style={styles.selectAction}>
              <Text style={styles.selectActionText}>Done</Text>
            </Pressable>
          </View>
        )}

        {/* Shared dock: drag a node onto the grid to place a block there */}
        <Dock
          categories={cats}
          onLongPress={(category, anchor) => radial.openRadial(category, anchor)}
          onDrop={handleDockDrop}
          onRadialMove={radial.handleRadialMove}
          onRadialRelease={radial.handleRadialRelease}
          onRadialAbort={radial.abortRadial}
        />
        {radial.radial && !radial.attached ? (
          <RadialMenu
            category={radial.radial.category}
            anchor={radial.radial.anchor}
            highlightedIndex={radial.hoveredIndex}
          />
        ) : null}
        {/* Ghost for a radial-armed drag: follows the finger until release. */}
        {radial.attached ? (
          <Animated.View style={[styles.dragGhost, radialGhostStyle]} pointerEvents="none">
            <CategoryIcon
              icon={radial.attached.category.icon}
              color={radial.attached.category.color}
              size={24}
            />
            <Text style={styles.dragGhostLabel}>
              {radial.attached.category.subcategories?.find((s) => s.id === radial.attached?.subcategoryId)?.name ??
                radial.attached.category.name}
            </Text>
          </Animated.View>
        ) : null}

        {toast && (
          <View style={[styles.toast, { bottom: bottomInset + 8 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        {/* Detail peek — tap any block (even a tiny one) to see everything about it */}
        <Sheet
          visible={detail !== null}
          onClose={() => setDetail(null)}
          title={detail?.block.title}
        >
          {detail ? (
            <View style={styles.sheetBody}>
              <Text style={styles.sheetSub}>
                {formatRange(detail.block)} · {detail.block.durationMin} min ·{' '}
                {categoryById(detail.block.categoryId, categories).name}
              </Text>
              {detail.block.notes ? (
                <Text style={styles.sheetSub}>{detail.block.notes}</Text>
              ) : null}
              <Pressable
                onPress={() => {
                  const d = detail;
                  setDetail(null);
                  if (d) openEdit(d.block, d.date);
                }}
                style={styles.saveBtn}
              >
                <Text style={styles.saveBtnText}>Edit block</Text>
              </Pressable>
              <Pressable onPress={duplicateDetailBlock} style={styles.scopeRow}>
                <Text style={styles.scopeRowText}>Duplicate</Text>
              </Pressable>
              <Pressable onPress={markDetailDone} style={styles.scopeRow}>
                <Text style={styles.scopeRowText}>Mark done</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSelected([detail.block.id]);
                  setDetail(null);
                }}
                style={styles.scopeRow}
              >
                <Text style={styles.scopeRowText}>Select (multi-select)</Text>
              </Pressable>
              <Pressable onPress={deleteDetailBlock} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>Delete block</Text>
              </Pressable>
            </View>
          ) : null}
        </Sheet>

        {/* Quick create / edit sheet */}
        <Sheet
          visible={quick !== null}
          onClose={() => setQuick(null)}
          title={quick?.mode === 'edit' ? 'Edit block' : `New block · ${quick ? minToTime(quick.startMin) : ''}`}
        >
          <View style={styles.sheetBody}>
              <TextInput
                value={qcTitle}
                onChangeText={setQcTitle}
                placeholder="Block title"
                placeholderTextColor={faintText}
                style={styles.input}
              />
              <Text style={styles.sheetLabel}>Category</Text>
              <View style={styles.chipWrap}>
                {cats.map((cat) => {
                  const active = qcCategoryId === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => selectQcCategory(cat.id)}
                      style={[styles.catChip, active && styles.catChipActive]}
                    >
                      <View style={[styles.catDot, { backgroundColor: categoryColorHex[cat.color] }]} />
                      <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{cat.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.sheetLabel}>Duration · {qcDuration} min</Text>
              <View style={styles.durationRow}>
                {[15, 25, 45, 60].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setQcDuration(d)}
                    style={[styles.durationChip, qcDuration === d && styles.durationChipActive]}
                  >
                    <Text style={[styles.durationText, qcDuration === d && styles.durationTextActive]}>{d}m</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setQcDuration((v) => clamp(v - 5, 10, 240))} style={styles.stepper}>
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Pressable onPress={() => setQcDuration((v) => clamp(v + 5, 10, 240))} style={styles.stepper}>
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.nudgeRow}>
                <Text style={styles.sheetLabel}>Nudge for this block</Text>
                <Switch
                  value={!qcDoNotNudge}
                  onValueChange={(v) => {
                    setQcNudgeDirty(true);
                    setQcDoNotNudge(!v);
                  }}
                  trackColor={{ false: 'rgba(10,10,10,0.15)', true: colors.carbon }}
                  thumbColor={colors.paper}
                  accessibilityRole="switch"
                  accessibilityLabel="Nudge for this block"
                />
              </View>
              <Pressable onPress={saveQuick} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>{quick?.mode === 'edit' ? 'Save changes' : 'Add block'}</Text>
              </Pressable>
              {quick?.mode === 'edit' && (
                <Pressable onPress={deleteQuickBlock} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>Delete block</Text>
                </Pressable>
              )}
          </View>
        </Sheet>

        {/* Scope sheet — shown on every change; the change only runs
            once a scope is picked, dismissing cancels it. */}
        <Sheet visible={pending !== null} onClose={cancelPending} title="Apply this change to…">
          <View style={styles.sheetBody}>
              {pending && <Text style={styles.sheetSub}>{pending.description}</Text>}
              <Text style={styles.sheetNote}>
                Last scope: {SCOPE_LABELS[lastScope]}. Picking a scope applies the change to the routine template where it fits; a block that only exists today falls back to today only.
              </Text>
              {(['today', 'onwards'] as Scope[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => confirmScope(s)}
                  style={styles.scopeRow}
                >
                  <Text style={styles.scopeRowText}>{SCOPE_LABELS[s]}</Text>
                </Pressable>
              ))}
              {!scopeMore ? (
                <Pressable onPress={() => setScopeMore(true)} style={styles.scopeRow}>
                  <Text style={styles.scopeRowText}>More…</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => confirmScope('weekday')}
                  style={styles.scopeRow}
                >
                  <Text style={styles.scopeRowText}>{SCOPE_LABELS.weekday}</Text>
                </Pressable>
              )}
          </View>
        </Sheet>

        {/* Swap sheet — when a drop cannot auto-shift */}
        <Sheet visible={swapSheet !== null} onClose={() => setSwapSheet(null)} title="No room to shift">
          <View style={styles.sheetBody}>
              {swapSheet && (
                <Text style={styles.sheetSub}>
                  “{swapSheet.moved.title}” cannot fit at {minToTime(swapSheet.moved.startMin)} without pushing “
                  {swapSheet.conflict.title}” past midnight. Swap their times instead?
                </Text>
              )}
              <Pressable onPress={doSwap} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Swap times</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSwapSheet(null);
                  showToast('Move cancelled');
                }}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteBtnText}>Keep as it was</Text>
              </Pressable>
          </View>
        </Sheet>

        {/* Routine template picker */}
        <Sheet visible={templateSheet} onClose={() => setTemplateSheet(false)} title="Apply a routine">
          <View style={styles.sheetBody}>
              <View style={styles.segmented}>
                {(['day', 'visible'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setTemplateTarget(t)}
                    style={[styles.segment, templateTarget === t && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, templateTarget === t && styles.segmentTextActive]}>
                      {t === 'day' ? 'This day' : 'All visible days'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {ROUTINE_TEMPLATES.map((tpl) => (
                <Pressable key={tpl.id} onPress={() => applyTemplate(tpl)} style={styles.templateRow}>
                  <View style={styles.templateDot}>
                    <Text style={styles.templateKind}>{tpl.kind}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateName}>{tpl.name}</Text>
                    <Text style={styles.templateBlurb}>{tpl.blurb}</Text>
                  </View>
                </Pressable>
              ))}
          </View>
        </Sheet>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud },
  container: { flex: 1, backgroundColor: colors.cloud },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  monthTitle: { fontFamily: fonts.semibold, fontSize: 26, color: colors.carbon },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  iconBtnText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  disabledText: { color: faintText },
  todayBtn: {
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 4,
  },
  todayBtnText: { fontFamily: fonts.medium, fontSize: 13, color: colors.paper },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 6,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  navBtnText: { fontFamily: fonts.semibold, fontSize: 20, color: colors.carbon, lineHeight: 22 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: hairline,
    padding: 3,
    gap: 2,
  },
  segment: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  segmentActive: { backgroundColor: colors.carbon },
  segmentText: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon },
  segmentTextActive: { color: colors.paper },
  applyBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: hairline,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  applyBtnText: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon },
  pasteBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.butter,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pasteBtnText: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon },
  strip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  stripItem: { flex: 1, alignItems: 'center', gap: 4 },
  stripWeekday: { fontFamily: fonts.medium, fontSize: 10, color: faintText },
  stripDay: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripDayActive: { backgroundColor: colors.carbon },
  stripDayToday: { borderWidth: 1, borderColor: colors.carbon },
  stripDayText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  stripDayTextActive: { color: colors.paper },
  gridScroll: { flex: 1 },
  hourRow: { flexDirection: 'row', alignItems: 'flex-start' },
  hourLabelWrap: { width: GUTTER, alignItems: 'center', paddingTop: 2 },
  hourLabel: { fontFamily: fonts.regular, fontSize: 11, color: faintText },
  hourLine: { flex: 1, borderTopWidth: 1, borderTopColor: hairline },
  colSep: { position: 'absolute', top: 0, width: 1, backgroundColor: hairline },
  nowLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.carbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPin: {
    position: 'absolute',
    left: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.carbon,
  },
  nowLabel: {
    position: 'absolute',
    left: 10,
    top: -18,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.paper,
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  ghost: { position: 'absolute', borderRadius: 12, borderWidth: 2, borderColor: colors.carbon, borderStyle: 'dashed' },
  dragGhost: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  dragGhostLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paper },
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tooltipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.paper },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  selectCount: { fontFamily: fonts.medium, fontSize: 13, color: colors.paper, flex: 1 },
  selectAction: { paddingHorizontal: 8, paddingVertical: 4 },
  selectActionText: { fontFamily: fonts.medium, fontSize: 13, color: colors.paper },
  selectDelete: { backgroundColor: colors.orchid, borderRadius: radii.pill },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { fontFamily: fonts.medium, fontSize: 13, color: colors.paper },
  sheetBody: { gap: 10 },
  sheetSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.carbon, lineHeight: 20 },
  sheetNote: { fontFamily: fonts.regular, fontSize: 12, color: faintText, lineHeight: 17 },
  sheetLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.carbon,
    backgroundColor: colors.cloud,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: hairline,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  catChipActive: { backgroundColor: colors.carbon, borderColor: colors.carbon },
  catChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon },
  catChipTextActive: { color: colors.paper },
  durationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nudgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  durationChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: hairline,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  durationChipActive: { backgroundColor: colors.carbon, borderColor: colors.carbon },
  durationText: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon },
  durationTextActive: { color: colors.paper },
  stepper: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.carbon },
  saveBtn: {
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paper },
  deleteBtn: { paddingVertical: 10, alignItems: 'center' },
  deleteBtnText: { fontFamily: fonts.medium, fontSize: 14, color: colors.orchid },
  scopeRow: {
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  scopeRowText: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: 16,
    padding: 14,
  },
  templateDot: {
    backgroundColor: colors.butter,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateKind: { fontFamily: fonts.medium, fontSize: 11, color: colors.carbon },
  templateName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  templateBlurb: { fontFamily: fonts.regular, fontSize: 12, color: faintText, marginTop: 2 },
});
