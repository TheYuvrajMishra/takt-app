// Takt — Today screen (default home, center-aligned).
// Greeting + live clock, butter hero with the discipline score so far today,
// current task front and center, big Done button, timeline strip, and the
// Now / Next up / Left / Done sections. Tapping a block opens a sheet whose
// edits are scoped "Today only". Uses Worker A's real store
// (src/store/useStore.ts) — no stub: the store landed before this screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/TText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, hairline, radii, spacing } from '../../theme/tokens';
import { DEFAULT_DURATION_MIN } from '../../types';
import type { Block, Category, CompletionEntry } from '../../types';
import {
  blockEnd,
  dateKey,
  disciplineScore,
  earliestEmptySlot,
  minToTime,
} from '../../lib/core';
import { computeStreaks, daysFromStore } from '../../lib/stats';
import { useStore } from '../../store/useStore';
import { Card } from '../../components/Card';
import { Pill } from '../../components/Pill';
import type { PillStatus } from '../../components/Pill';
import { BigButton } from '../../components/BigButton';
import { BlockChip, BLOCK_CHIP_WIDTH } from '../../components/BlockChip';
import { Sheet } from '../../components/Sheet';
import { Dock } from '../../components/Dock';
import { ScrollScreen } from '../../components/layout';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { RadialMenu } from '../../components/RadialMenu';
import { useRadialDrag } from '../../components/useRadialDrag';
import { EndOfDaySheet } from '../../components/EndOfDaySheet';
import { CategoryIcon } from '../../components/CategoryIcon';
import { formatSize, useUpdaterStore } from '../../lib/updater';

function greetingFor(hour: number): string {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function fmtRemaining(mins: number): string {
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

function statusFor(block: Block, entry: CompletionEntry | undefined, nowMin: number): PillStatus {
  if (entry?.status === 'complete') return 'complete';
  if (entry?.status === 'progress') return 'progress';
  if (entry?.status === 'skipped') return 'upcoming';
  const end = blockEnd(block);
  if (end <= nowMin) return 'missed';
  if (block.startMin <= nowMin) return 'progress';
  return 'upcoming';
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const today = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const hydrated = useStore((s) => s.hydrated);
  const load = useStore((s) => s.load);
  const categories = useStore((s) => s.categories);
  const completions = useStore((s) => s.completions);
  const dayOverrides = useStore((s) => s.dayOverrides);
  const templates = useStore((s) => s.templates);
  const getBlocksForDate = useStore((s) => s.getBlocksForDate);
  const getCompletion = useStore((s) => s.getCompletion);
  const markDone = useStore((s) => s.markDone);
  const markStarted = useStore((s) => s.markStarted);
  const addBlock = useStore((s) => s.addBlock);
  const moveBlock = useStore((s) => s.moveBlock);
  const resizeBlock = useStore((s) => s.resizeBlock);
  const patchBlock = useStore((s) => s.patchBlock);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const snooze = useStore((s) => s.snooze);
  const setToastHandler = useStore((s) => s.setToastHandler);

  const [doneOpen, setDoneOpen] = useState(false);
  const [sheetBlock, setSheetBlock] = useState<Block | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const stripRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const stripWidthRef = useRef(0);
  const summaryShownRef = useRef(false);
  // Drop-target highlight while a category is being dragged in from the
  // dock or the radial: the section under the finger tints butter.
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const sectionLayoutsRef = useRef(new Map<string, { y: number; height: number }>());
  const scrollYRef = useRef(0);
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);

  // Hydrate the store once.
  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  // Live clock (10s tick is plenty for a HH:MM clock).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Store toast -> small pill at the top of the screen.
  useEffect(() => {
    setToastHandler((msg) => setToastMsg(msg));
    return () => setToastHandler(null);
  }, [setToastHandler]);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const blocks = useMemo(
    () => [...getBlocksForDate(today)].sort((a, b) => a.startMin - b.startMin),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, dayOverrides, templates],
  );
  const todayCompletions = useMemo(
    () => completions.filter((c) => c.date === today),
    [completions, today],
  );
  const score = disciplineScore(blocks, todayCompletions);

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const isResolved = (b: Block) => {
    const e = getCompletion(b.id, today);
    return e?.status === 'complete' || e?.status === 'skipped';
  };
  const current = blocks.find(
    (b) => !isResolved(b) && b.startMin <= nowMin && nowMin < blockEnd(b),
  );
  const next = blocks.find((b) => !isResolved(b) && b.startMin > nowMin);
  const heroBlock = current ?? next ?? null;
  const heroCategory = heroBlock ? categoryById.get(heroBlock.categoryId) : undefined;

  const nowBlocks = blocks.filter(
    (b) => !isResolved(b) && b.startMin <= nowMin && nowMin < blockEnd(b),
  );
  const upcomingAfterNow = blocks.filter((b) => !isResolved(b) && b.startMin > nowMin);
  const nextBlock = upcomingAfterNow[0];
  const leftBlocks = [
    ...blocks.filter((b) => !isResolved(b) && blockEnd(b) <= nowMin),
    ...upcomingAfterNow.slice(1),
  ].sort((a, b) => a.startMin - b.startMin);
  const doneBlocks = blocks.filter((b) => isResolved(b));

  // End of day: every block resolved -> show the summary once.
  const allDone = blocks.length > 0 && blocks.every((b) => isResolved(b));
  useEffect(() => {
    if (allDone && !summaryShownRef.current) {
      summaryShownRef.current = true;
      setSummaryVisible(true);
    }
    if (!allDone) summaryShownRef.current = false;
  }, [allDone]);

  // Auto-center the timeline strip on the current block.
  useEffect(() => {
    const anchor = current ?? next;
    if (!anchor) return;
    const idx = blocks.findIndex((b) => b.id === anchor.id);
    if (idx < 0) return;
    const x = Math.max(
      0,
      idx * (BLOCK_CHIP_WIDTH + 8) - stripWidthRef.current / 2 + BLOCK_CHIP_WIDTH / 2,
    );
    const t = setTimeout(() => stripRef.current?.scrollTo({ x, animated: true }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length, current?.id, next?.id]);

  // --- Dock / radial quick-add -------------------------------------------
  const createInEarliestSlot = (category: Category, subcategoryId?: string) => {
    const slot = earliestEmptySlot(blocks, nowMin, DEFAULT_DURATION_MIN);
    if (slot === null) {
      setToastMsg('No free slot left today.');
      return;
    }
    const sub = category.subcategories?.find((s) => s.id === subcategoryId);
    void addBlock(
      {
        categoryId: category.id,
        subcategoryId,
        title: sub?.name ?? category.name,
        startMin: slot,
        durationMin: DEFAULT_DURATION_MIN,
      },
      today,
      'today',
    );
  };

  const handleDockDrop = (category: Category) => {
    // Drop anywhere creates in the earliest empty slot from now.
    // (Dropping onto a specific time on the timeline is a later step.)
    setHighlightedSection(null);
    createInEarliestSlot(category);
  };

  // Finger position while a category is being dragged in (from the dock
  // or after a radial dwell): move the ghost and tint the section under
  // the finger. Section layouts are content-relative, so the finger's
  // page Y is converted with the scroll offset; the ScrollScreen starts
  // at insets.top + 8 (the root's paddingTop).
  const handleDragMove = useCallback(
    (x: number, y: number) => {
      ghostX.value = x;
      ghostY.value = y;
      const contentY = y - (insets.top + 8) + scrollYRef.current;
      let found: string | null = null;
      for (const [key, box] of sectionLayoutsRef.current) {
        if (contentY >= box.y && contentY < box.y + box.height) {
          found = key;
          break;
        }
      }
      setHighlightedSection((prev) => (prev === found ? prev : found));
    },
    [ghostX, ghostY, insets.top],
  );

  const clearDragHighlight = useCallback(() => {
    setHighlightedSection(null);
  }, []);

  const handleRadialCreate = (category: Category, subcategoryId?: string) => {
    setHighlightedSection(null);
    createInEarliestSlot(category, subcategoryId);
  };

  // Release after a dwell-armed radial drag: drop it in the earliest
  // empty slot (drop-anywhere = earliest slot remains the creation rule
  // on Today). Nothing is created until this release.
  const handleRadialDrop = (category: Category, subcategoryId: string | undefined) => {
    setHighlightedSection(null);
    createInEarliestSlot(category, subcategoryId);
  };

  const dismissRadial = useCallback(() => {
    setHighlightedSection(null);
  }, []);

  // Radial quick-add (one continuous touch — hold, slide, hover 300ms,
  // drag, release): the hook owns the hover / dwell / attach machine;
  // the dock forwards the finger and this screen only decides what
  // "create" and "drop" mean.
  const radial = useRadialDrag({
    onCreate: handleRadialCreate,
    onDrop: handleRadialDrop,
    onDragMove: handleDragMove,
    onDismiss: dismissRadial,
  });

  // --- Sheet actions (all "Today only") -----------------------------------
  // Category / notes edits go through the store's patchBlock, which keeps
  // the block id (and its completion) intact.
  type BlockPatch = Partial<
    Pick<
      Block,
      'categoryId' | 'subcategoryId' | 'title' | 'notes' | 'doNotNudge' | 'alarmMode'
    >
  >;
  const updateBlockToday = (block: Block, patch: BlockPatch) => {
    void patchBlock(block.id, today, patch, 'today');
    // Keep the open sheet in sync with the patched block.
    setSheetBlock((prev) =>
      prev && prev.id === block.id ? { ...prev, ...patch } : prev,
    );
  };

  const openSheet = (block: Block) => {
    setNotesDraft(block.notes ?? '');
    setSheetBlock(block);
  };

  const sheetCategory = sheetBlock ? categoryById.get(sheetBlock.categoryId) : undefined;
  const sheetStatus = sheetBlock ? statusFor(sheetBlock, getCompletion(sheetBlock.id, today), nowMin) : 'upcoming';

  // --- End-of-day summary data --------------------------------------------
  const streak = useMemo(() => {
    const days = daysFromStore(getBlocksForDate, completions, 90);
    return computeStreaks(days, today).current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completions, dayOverrides, templates, today]);

  const doneCount = doneBlocks.filter(
    (b) => getCompletion(b.id, today)?.status === 'complete',
  ).length;
  const missedCount = blocks.filter(
    (b) => statusFor(b, getCompletion(b.id, today), nowMin) === 'missed',
  ).length;
  const highlightBlock =
    blocks.find((b) => {
      const e = getCompletion(b.id, today);
      return e?.status === 'complete' && e.onTime;
    }) ?? blocks.find((b) => getCompletion(b.id, today)?.status === 'complete');
  const highlight = highlightBlock
    ? `${highlightBlock.title} — done${getCompletion(highlightBlock.id, today)?.onTime ? ' on time' : ''}.`
    : 'Every block resolved.';
  const tomorrowKey = dateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const tomorrowBlocks = [...getBlocksForDate(tomorrowKey)].sort((a, b) => a.startMin - b.startMin);
  const firstTomorrow = tomorrowBlocks[0];
  const firstTaskTomorrow = firstTomorrow
    ? `${minToTime(firstTomorrow.startMin)} — ${firstTomorrow.title}`
    : 'Nothing scheduled yet';

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const dragGhostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ghostX.value - 56 },
      { translateY: ghostY.value - 28 },
      { scale: 1.1 },
    ],
  }));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <ScrollScreen
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
      >
        {/* Greeting + live clock */}
        <Text style={styles.greeting}>{greetingFor(now.getHours())}</Text>
        <Text style={styles.clock}>{clock}</Text>
        <Text style={styles.dateLine}>{dateLine}</Text>

        {/* Update banner (Fix 6): calm, non-blocking, never interrupts a
            task or a drag — just a row that opens the update sheet. */}
        <UpdateBanner />

        {/* Hero: discipline score + current task + Done */}
        <Card color={colors.butter} style={styles.hero}>
          <Text style={styles.heroLabel}>Discipline so far today</Text>
          <Text style={styles.score}>
            {blocks.length === 0 ? '—' : `${score}%`}
          </Text>
          {heroBlock ? (
            <>
              <View style={styles.heroDivider} />
              <View style={styles.heroTaskRow}>
                {heroCategory ? (
                  <CategoryIcon icon={heroCategory.icon} color={heroCategory.color} size={40} />
                ) : null}
                <View style={styles.heroTaskText}>
                  <Text style={styles.heroTaskTitle} numberOfLines={2}>
                    {heroBlock.title}
                  </Text>
                  <Text style={styles.heroTaskMeta}>
                    {current
                      ? fmtRemaining(blockEnd(heroBlock) - nowMin)
                      : `starts ${minToTime(heroBlock.startMin)}`}
                    {'  ·  '}
                    {minToTime(heroBlock.startMin)} – {minToTime(blockEnd(heroBlock))}
                  </Text>
                </View>
              </View>
              <BigButton
                label="Done"
                onPress={() => void markDone(heroBlock.id, today)}
                style={styles.doneButton}
              />
              <View style={styles.secondaryRow}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => void markStarted(heroBlock.id, today)}
                >
                  <Text style={styles.secondaryText}>Start</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => void snooze(heroBlock.id, today, 15)}
                >
                  <Text style={styles.secondaryText}>Snooze 15 min</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.heroEmpty}>
              {blocks.length === 0
                ? 'No blocks today yet. Drag a node from the dock, or long-press one to pick a subcategory.'
                : 'All clear — every block is done.'}
            </Text>
          )}
        </Card>

        {/* Timeline strip */}
        {blocks.length > 0 ? (
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={(e) => {
              stripWidthRef.current = e.nativeEvent.layout.width;
            }}
            contentContainerStyle={styles.strip}
          >
            {blocks.map((block) => (
              <BlockChip
                key={block.id}
                block={block}
                category={categoryById.get(block.categoryId)}
                status={statusFor(block, getCompletion(block.id, today), nowMin)}
                isNow={current?.id === block.id}
                onPress={() => openSheet(block)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Sections */}
        {nowBlocks.length > 0 ? (
          <Section
            title="Now"
            sectionKey="now"
            highlighted={highlightedSection === 'now'}
            onLayout={(y, height) => sectionLayoutsRef.current.set('now', { y, height })}
          >
            {nowBlocks.map((b) => (
              <BlockRow
                key={b.id}
                block={b}
                category={categoryById.get(b.categoryId)}
                status={statusFor(b, getCompletion(b.id, today), nowMin)}
                onPress={() => openSheet(b)}
              />
            ))}
          </Section>
        ) : null}

        {nextBlock ? (
          <Section
            title="Next up"
            sectionKey="next"
            highlighted={highlightedSection === 'next'}
            onLayout={(y, height) => sectionLayoutsRef.current.set('next', { y, height })}
          >
            <BlockRow
              block={nextBlock}
              category={categoryById.get(nextBlock.categoryId)}
              status={statusFor(nextBlock, getCompletion(nextBlock.id, today), nowMin)}
              onPress={() => openSheet(nextBlock)}
            />
          </Section>
        ) : null}

        {leftBlocks.length > 0 ? (
          <Section
            title="Left"
            sectionKey="left"
            highlighted={highlightedSection === 'left'}
            onLayout={(y, height) => sectionLayoutsRef.current.set('left', { y, height })}
          >
            {leftBlocks.map((b) => (
              <BlockRow
                key={b.id}
                block={b}
                category={categoryById.get(b.categoryId)}
                status={statusFor(b, getCompletion(b.id, today), nowMin)}
                onPress={() => openSheet(b)}
              />
            ))}
          </Section>
        ) : null}

        {doneBlocks.length > 0 ? (
          <Section
            title={`Done (${doneBlocks.length})`}
            sectionKey="done"
            highlighted={highlightedSection === 'done'}
            onLayout={(y, height) => sectionLayoutsRef.current.set('done', { y, height })}
            collapsed={!doneOpen}
            onToggle={() => setDoneOpen((v) => !v)}
          >
            {doneOpen
              ? doneBlocks.map((b) => (
                  <BlockRow
                    key={b.id}
                    block={b}
                    category={categoryById.get(b.categoryId)}
                    status={statusFor(b, getCompletion(b.id, today), nowMin)}
                    onPress={() => openSheet(b)}
                  />
                ))
              : null}
            {doneOpen && allDone ? (
              <Pressable style={styles.summaryButton} onPress={() => setSummaryVisible(true)}>
                <Text style={styles.summaryButtonText}>View day summary</Text>
              </Pressable>
            ) : null}
          </Section>
        ) : null}
      </ScrollScreen>

      {/* Dock + radial quick-add */}
      <Dock
        categories={categories}
        onLongPress={(category, anchor) => radial.openRadial(category, anchor)}
        onDrop={handleDockDrop}
        onDragMove={handleDragMove}
        onDragAbort={clearDragHighlight}
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
        <Animated.View style={[styles.dragGhost, dragGhostStyle]} pointerEvents="none">
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

      {/* Block sheet */}
      <Sheet
        visible={sheetBlock !== null}
        onClose={() => setSheetBlock(null)}
        title={sheetBlock?.title}
        scopeLabel="Today only"
      >
        {sheetBlock ? (
          <View>
            <View style={styles.sheetHead}>
              {sheetCategory ? (
                <CategoryIcon icon={sheetCategory.icon} color={sheetCategory.color} size={36} />
              ) : null}
              <Text style={styles.sheetMeta}>
                {minToTime(sheetBlock.startMin)} – {minToTime(blockEnd(sheetBlock))} ·{' '}
                {sheetBlock.durationMin} min
              </Text>
              <Pill status={sheetStatus} />
              {sheetBlock.doNotNudge ? (
                <Text style={styles.sheetMetaTag}>Won't nudge</Text>
              ) : null}
            </View>

            <BigButton
              label={sheetStatus === 'complete' ? 'Done' : 'Mark done'}
              onPress={() => {
                void markDone(sheetBlock.id, today);
                setSheetBlock(null);
              }}
              disabled={sheetStatus === 'complete'}
              style={styles.sheetPrimary}
            />

            <View style={styles.actionGrid}>
              <SheetAction label="Move +15 min" onPress={() => void moveBlock(sheetBlock.id, today, sheetBlock.startMin + 15, 'today')} />
              <SheetAction label="Move −15 min" onPress={() => void moveBlock(sheetBlock.id, today, Math.max(0, sheetBlock.startMin - 15), 'today')} />
              <SheetAction label="Resize +15 min" onPress={() => void resizeBlock(sheetBlock.id, today, sheetBlock.durationMin + 15, 'today')} />
              <SheetAction label="Snooze 15 min" onPress={() => void snooze(sheetBlock.id, today, 15)} />
              <SheetAction
                label="Change category"
                onPress={() => {
                  if (categories.length === 0) return;
                  const idx = categories.findIndex((c) => c.id === sheetBlock.categoryId);
                  const nextCat = categories[(idx + 1) % categories.length];
                  void updateBlockToday(sheetBlock, { categoryId: nextCat.id });
                }}
              />
              <SheetAction
                label={sheetBlock.doNotNudge ? 'Turn nudges on' : 'Turn nudges off'}
                onPress={() => {
                  void updateBlockToday(sheetBlock, { doNotNudge: !sheetBlock.doNotNudge });
                }}
              />
              <SheetAction
                label="Delete"
                onPress={() => {
                  void deleteBlock(sheetBlock.id, today, 'today');
                  setSheetBlock(null);
                }}
              />
            </View>

            <Text style={styles.notesLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder="Add a note for today"
              placeholderTextColor="rgba(10,10,10,0.4)"
              multiline
            />
            <Pressable
              style={styles.saveNotes}
              onPress={() => {
                if (notesDraft !== (sheetBlock.notes ?? '')) {
                  void updateBlockToday(sheetBlock, { notes: notesDraft });
                }
              }}
            >
              <Text style={styles.saveNotesText}>Save notes</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      {/* End-of-day summary */}
      <EndOfDaySheet
        visible={summaryVisible}
        onClose={() => setSummaryVisible(false)}
        date={today}
        score={score}
        streak={streak}
        done={doneCount}
        missed={missedCount}
        highlight={highlight}
        firstTaskTomorrow={firstTaskTomorrow}
      />

      {/* Toast */}
      {toastMsg ? (
        <View style={[styles.toast, { top: insets.top + 8 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Section({
  title,
  children,
  collapsed,
  onToggle,
  sectionKey,
  highlighted,
  onLayout,
}: {
  title: string;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  sectionKey?: string;
  highlighted?: boolean;
  /** Content-relative layout, reported for drop-target highlighting. */
  onLayout?: (y: number, height: number) => void;
}) {
  const head = (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onToggle ? (
        <Text style={styles.sectionToggle}>{collapsed ? 'Show' : 'Hide'}</Text>
      ) : null}
    </View>
  );
  return (
    <View
      style={[styles.section, highlighted && styles.sectionHighlighted]}
      onLayout={
        onLayout
          ? (e) => onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)
          : undefined
      }
    >
      {onToggle ? (
        <Pressable onPress={onToggle}>{head}</Pressable>
      ) : (
        head
      )}
      {children}
    </View>
  );
}

function BlockRow({
  block,
  category,
  status,
  onPress,
}: {
  block: Block;
  category?: Category;
  status: PillStatus;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <CategoryIcon icon={category?.icon ?? 'custom'} color={category?.color ?? 'carbon'} size={32} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {block.title}
        </Text>
        <Text style={styles.rowMeta}>
          {minToTime(block.startMin)} – {minToTime(blockEnd(block))} · {block.durationMin} min
          {block.doNotNudge ? " · Won't nudge" : ''}
        </Text>
      </View>
      <Pill status={status} />
    </Pressable>
  );
}

function SheetAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionButton}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/** Calm update banner (Fix 6): shows only when an update is pending or
    downloading — a tap opens the update sheet. Never a modal, never in
    the way of a drag. */
function UpdateBanner() {
  const status = useUpdaterStore((s) => s.status);
  const remote = useUpdaterStore((s) => s.remote);
  const progress = useUpdaterStore((s) => s.progress);
  const verifyProgress = useUpdaterStore((s) => s.verifyProgress);
  const openSheet = useUpdaterStore((s) => s.openSheet);
  if (!remote) return null;
  if (status === 'available') {
    return (
      <Pressable style={styles.updateBanner} onPress={openSheet} accessibilityRole="button">
        <Text style={styles.updateBannerText}>
          Update ready · build {remote.versionCode} ({formatSize(remote.sizeBytes)})
        </Text>
        <Text style={styles.updateBannerAction}>View</Text>
      </Pressable>
    );
  }
  if (status === 'downloading') {
    return (
      <Pressable style={styles.updateBanner} onPress={openSheet} accessibilityRole="button">
        <Text style={styles.updateBannerText}>
          Downloading update · {Math.round(progress * 100)}%
        </Text>
        <Text style={styles.updateBannerAction}>View</Text>
      </Pressable>
    );
  }
  if (status === 'verifying') {
    return (
      <Pressable style={styles.updateBanner} onPress={openSheet} accessibilityRole="button">
        <Text style={styles.updateBannerText}>
          Verifying update · {Math.round(verifyProgress * 100)}%
        </Text>
        <Text style={styles.updateBannerAction}>View</Text>
      </Pressable>
    );
  }
  if (status === 'ready') {
    return (
      <Pressable style={styles.updateBanner} onPress={openSheet} accessibilityRole="button">
        <Text style={styles.updateBannerText}>Update downloaded — ready to install</Text>
        <Text style={styles.updateBannerAction}>Install</Text>
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  greeting: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.carbon,
    textAlign: 'center',
  },
  clock: {
    fontFamily: fonts.regular,
    fontSize: 64,
    lineHeight: 72,
    color: colors.carbon,
    textAlign: 'center',
  },
  dateLine: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.carbon,
    opacity: 0.55,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.paper,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginBottom: spacing.md,
  },
  updateBannerText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  updateBannerAction: { fontFamily: fonts.semibold, fontSize: 14, color: colors.carbon },
  hero: { width: '100%', alignItems: 'center', paddingVertical: spacing.lg },
  heroLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, opacity: 0.6 },
  score: { fontFamily: fonts.regular, fontSize: 110, lineHeight: 118, color: colors.carbon },
  heroDivider: { width: '100%', height: 1, backgroundColor: hairline, marginVertical: spacing.md },
  heroTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  heroTaskText: { flex: 1 },
  heroTaskTitle: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, color: colors.carbon },
  heroTaskMeta: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, opacity: 0.6, marginTop: 2 },
  heroEmpty: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.carbon,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  doneButton: { marginTop: spacing.lg, width: '100%' },
  secondaryRow: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
  secondaryButton: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: hairline,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  strip: { paddingTop: spacing.lg, paddingRight: 4 },
  section: { width: '100%', marginTop: spacing.lg },
  // Drop-target highlight: the section under a dragged category tints
  // butter. Background + radius only — no padding/margin change, so the
  // layout never jumps while dragging.
  sectionHighlighted: { backgroundColor: colors.butter, borderRadius: radii.cardSm },
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
    zIndex: 70,
  },
  dragGhostLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paper },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 19, color: colors.carbon },
  sectionToggle: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, opacity: 0.55 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.paper,
    borderRadius: radii.cardSm,
    padding: 14,
    marginBottom: 8,
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.carbon },
  rowMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.carbon, opacity: 0.55, marginTop: 2 },
  summaryButton: {
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  summaryButtonText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paper },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  sheetMeta: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, flex: 1 },
  // Compact tag beside the Pill: no flex, so it never squeezes the time.
  sheetMetaTag: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  sheetPrimary: { width: '100%' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  actionButton: {
    backgroundColor: colors.cloud,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  notesLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon, marginTop: spacing.lg, marginBottom: 6 },
  notesInput: {
    backgroundColor: colors.cloud,
    borderRadius: 16,
    padding: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.carbon,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  saveNotes: { alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 4 },
  saveNotesText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 80,
  },
  toastText: { fontFamily: fonts.medium, fontSize: 14, color: colors.paper },
});
