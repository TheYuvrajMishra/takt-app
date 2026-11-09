// Scope tests for the store's patchBlock (src/store/useStore.ts).
// Runs the real store method against a mocked sqlite layer (same mock as
// nudge.test.ts): state is seeded via useStore.setState, db calls no-op.
// 2026-11-10 is a Tuesday (weekday 2); 2026-11-11 Wednesday (3);
// 2026-11-12 Thursday (4).
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async () => []),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  })),
}));

import type { Block, RoutineTemplate } from '../../types';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../../types';
import { useStore } from '../../store/useStore';

const TUESDAY = '2026-11-10';
const WEDNESDAY = '2026-11-11';
const THURSDAY = '2026-11-12';

function templateBlock(): Block & { weekdays: number[] } {
  return {
    id: 'blk-run',
    categoryId: 'cat-workout',
    title: 'Morning run',
    startMin: 420,
    durationMin: 30,
    weekdays: [1, 2, 3, 4, 5],
  };
}

function seedTemplate(): RoutineTemplate {
  return {
    id: 'tpl-1',
    name: 'My routine',
    effectiveFrom: '2026-11-09',
    blocks: [templateBlock()],
  };
}

function seedStore(overrides: Record<string, Block[]> = {}): void {
  useStore.setState({
    hydrated: true,
    categories: [...DEFAULT_CATEGORIES],
    templates: [seedTemplate()],
    activeTemplateId: 'tpl-1',
    dayOverrides: overrides,
    completions: [
      { blockId: 'blk-run', date: TUESDAY, status: 'complete', onTime: true },
    ],
    settings: { ...DEFAULT_SETTINGS },
    selectedDate: TUESDAY,
    undoStack: [],
    redoStack: [],
    lastToast: null,
    toastHandler: null,
  });
}

describe('patchBlock', () => {
  it('today scope patches only that date via a day override', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Morning jog' }, 'today');

    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Morning jog');
    expect(after.getBlocksForDate(WEDNESDAY)[0]?.title).toBe('Morning run');
    // Template untouched.
    expect(after.templates[0].blocks[0].title).toBe('Morning run');
    expect(after.dayOverrides[TUESDAY]).toHaveLength(1);
    expect(after.lastToast).toBe('Updated for today only.');
  });

  it('onwards scope patches the template block everywhere it recurs', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { categoryId: 'cat-learning' }, 'onwards');

    const after = useStore.getState();
    expect(after.templates[0].blocks[0].categoryId).toBe('cat-learning');
    expect(after.getBlocksForDate(THURSDAY)[0]?.categoryId).toBe('cat-learning');
    expect(after.getBlocksForDate(TUESDAY)[0]?.categoryId).toBe('cat-learning');
    expect(after.dayOverrides[TUESDAY]).toBeUndefined();
    expect(after.lastToast).toBe('Updated from today onwards.');
  });

  it('weekday scope splits the template block for that weekday only', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');

    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Tuesday run club');
    expect(after.getBlocksForDate(WEDNESDAY)[0]?.title).toBe('Morning run');
    expect(after.getBlocksForDate(THURSDAY)[0]?.title).toBe('Morning run');
    // The edited weekday's copy KEEPS the original id; the remainder
    // (other weekdays) gets a fresh id.
    const blocks = after.templates[0].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks.find((b) => b.id === 'blk-run')?.weekdays).toEqual([2]);
    expect(blocks.find((b) => b.id !== 'blk-run')?.weekdays).toEqual([1, 3, 4, 5]);
    expect(after.lastToast).toBe('Updated for this weekday onwards.');
  });

  it('weekday scope keeps the edited weekday completion (no orphan)', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');

    const after = useStore.getState();
    const tuesdayBlock = after.getBlocksForDate(TUESDAY)[0];
    expect(tuesdayBlock?.id).toBe('blk-run');
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
  });

  it('weekday scope: a past other-weekday completion migrates to the remainder id', async () => {
    seedStore();
    // Monday 2026-11-09 (weekday 1) was also completed under the old id.
    useStore.setState((s) => ({
      completions: [
        ...s.completions,
        { blockId: 'blk-run', date: '2026-11-09', status: 'complete', onTime: true },
      ],
    }));
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');

    const after = useStore.getState();
    const mondayBlock = after.getBlocksForDate('2026-11-09')[0];
    expect(mondayBlock?.id).not.toBe('blk-run');
    expect(after.getCompletion(mondayBlock!.id, '2026-11-09')?.status).toBe('complete');
    // And the edited weekday still keeps its own completion under the old id.
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
  });

  it('weekday scope: category patch + duration resize land on the same weekday', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { categoryId: 'cat-learning' }, 'weekday');
    await store.resizeBlock('blk-run', TUESDAY, 45, 'weekday');

    const after = useStore.getState();
    const tuesdayBlock = after.getBlocksForDate(TUESDAY)[0];
    expect(tuesdayBlock?.id).toBe('blk-run');
    expect(tuesdayBlock?.categoryId).toBe('cat-learning');
    expect(tuesdayBlock?.durationMin).toBe(45);
    const wednesdayBlock = after.getBlocksForDate(WEDNESDAY)[0];
    expect(wednesdayBlock?.categoryId).toBe('cat-workout');
    expect(wednesdayBlock?.durationMin).toBe(30);
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
  });

  it('weekday scope on a single-weekday block patches in place without re-id', async () => {
    useStore.setState({
      hydrated: true,
      categories: [...DEFAULT_CATEGORIES],
      templates: [
        {
          id: 'tpl-1',
          name: 'My routine',
          effectiveFrom: '2026-11-09',
          blocks: [{ ...templateBlock(), weekdays: [2] }],
        },
      ],
      activeTemplateId: 'tpl-1',
      dayOverrides: {},
      completions: [
        { blockId: 'blk-run', date: TUESDAY, status: 'complete', onTime: true },
      ],
      settings: { ...DEFAULT_SETTINGS },
      selectedDate: TUESDAY,
      undoStack: [],
      redoStack: [],
      lastToast: null,
      toastHandler: null,
    });
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');

    const after = useStore.getState();
    expect(after.templates[0].blocks).toHaveLength(1);
    expect(after.templates[0].blocks[0].id).toBe('blk-run');
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Tuesday run club');
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
  });

  it('a second weekday split chains the remainder migration', async () => {
    seedStore();
    useStore.setState((s) => ({
      completions: [
        ...s.completions,
        { blockId: 'blk-run', date: '2026-11-09', status: 'complete', onTime: true },
        { blockId: 'blk-run', date: WEDNESDAY, status: 'complete', onTime: true },
      ],
    }));
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');
    const remainder1 = useStore
      .getState()
      .getBlocksForDate(WEDNESDAY)[0]!.id;
    expect(remainder1).not.toBe('blk-run');
    await store.patchBlock(remainder1, WEDNESDAY, { title: 'Wednesday run club' }, 'weekday');

    const after = useStore.getState();
    // Tuesday keeps the original id, Wednesday keeps R1, Monday follows R2.
    expect(after.getBlocksForDate(TUESDAY)[0]?.id).toBe('blk-run');
    expect(after.getBlocksForDate(WEDNESDAY)[0]?.id).toBe(remainder1);
    const mondayBlock = after.getBlocksForDate('2026-11-09')[0]!;
    expect(mondayBlock.id).not.toBe('blk-run');
    expect(mondayBlock.id).not.toBe(remainder1);
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
    expect(after.getCompletion(remainder1, WEDNESDAY)?.status).toBe('complete');
    expect(after.getCompletion(mondayBlock.id, '2026-11-09')?.status).toBe('complete');
  });

  it('undo after a weekday split restores pre-split completions', async () => {
    seedStore();
    useStore.setState((s) => ({
      completions: [
        ...s.completions,
        { blockId: 'blk-run', date: '2026-11-09', status: 'complete', onTime: true },
      ],
    }));
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');
    expect(useStore.getState().templates[0].blocks).toHaveLength(2);

    await useStore.getState().undo();
    const after = useStore.getState();
    expect(after.templates[0].blocks).toHaveLength(1);
    expect(after.templates[0].blocks[0].id).toBe('blk-run');
    expect(after.templates[0].blocks[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
    expect(after.getCompletion('blk-run', '2026-11-09')?.status).toBe('complete');
  });

  it('a completion on an override-shadowed date follows the override re-keying', async () => {
    const mondayBlock: Block = {
      id: 'blk-run',
      categoryId: 'cat-workout',
      title: 'Monday run (override)',
      startMin: 420,
      durationMin: 30,
    };
    seedStore({ '2026-11-09': [mondayBlock] });
    useStore.setState((s) => ({
      completions: [
        ...s.completions,
        { blockId: 'blk-run', date: '2026-11-09', status: 'complete', onTime: true },
        // Sunday 2026-11-15: the block never recurs Sundays, so this stays put.
        { blockId: 'blk-run', date: '2026-11-15', status: 'complete', onTime: true },
      ],
    }));
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');

    const after = useStore.getState();
    // Monday's override copy was re-keyed to the remainder id, and its
    // completion followed — the link between them stays intact.
    const mondayAfter = after.getBlocksForDate('2026-11-09')[0]!;
    expect(mondayAfter.id).not.toBe('blk-run');
    expect(mondayAfter.title).toBe('Monday run (override)');
    expect(after.getCompletion(mondayAfter.id, '2026-11-09')?.status).toBe('complete');
    expect(after.getCompletion('blk-run', '2026-11-15')?.status).toBe('complete');
  });

  it('a completion under an older template version is not migrated', async () => {
    seedStore();
    useStore.setState((s) => ({
      templates: [
        {
          id: 'tpl-0',
          name: 'Old routine',
          effectiveFrom: '2026-11-02',
          blocks: [{ ...templateBlock(), weekdays: [1, 2, 3, 4, 5] }],
        },
        ...s.templates,
      ],
      completions: [
        ...s.completions,
        { blockId: 'blk-run', date: '2026-11-03', status: 'complete', onTime: true },
      ],
    }));
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');

    const after = useStore.getState();
    // 2026-11-03 is governed by tpl-0, untouched by the tpl-1 split.
    expect(after.getBlocksForDate('2026-11-03')[0]?.id).toBe('blk-run');
    expect(after.getCompletion('blk-run', '2026-11-03')?.status).toBe('complete');
  });

  it('weekday move and resize also migrate the other weekdays completion', async () => {
    seedStore();
    useStore.setState((s) => ({
      completions: [
        ...s.completions,
        { blockId: 'blk-run', date: '2026-11-09', status: 'complete', onTime: true },
      ],
    }));
    const store = useStore.getState();
    await store.moveBlock('blk-run', TUESDAY, 450, 'weekday');
    const remainderId = useStore.getState().getBlocksForDate('2026-11-09')[0]!.id;
    expect(remainderId).not.toBe('blk-run');
    expect(useStore.getState().getCompletion(remainderId, '2026-11-09')?.status).toBe('complete');
    expect(useStore.getState().getCompletion('blk-run', TUESDAY)?.status).toBe('complete');

    await store.resizeBlock('blk-run', TUESDAY, 45, 'weekday');
    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)[0]?.durationMin).toBe(45);
    expect(after.getBlocksForDate('2026-11-09')[0]?.durationMin).toBe(30);
    expect(after.getCompletion(remainderId, '2026-11-09')?.status).toBe('complete');
  });

  it('a drag auto-shift override does not shadow later weekday edits', async () => {
    const yoga: Block & { weekdays: number[] } = {
      id: 'blk-yoga',
      categoryId: 'cat-workout',
      title: 'Yoga',
      startMin: 460,
      durationMin: 30,
      weekdays: [1, 2, 3, 4, 5],
    };
    useStore.setState({
      hydrated: true,
      categories: [...DEFAULT_CATEGORIES],
      templates: [
        {
          id: 'tpl-1',
          name: 'My routine',
          effectiveFrom: '2026-11-09',
          blocks: [templateBlock(), yoga],
        },
      ],
      activeTemplateId: 'tpl-1',
      dayOverrides: {},
      completions: [],
      settings: { ...DEFAULT_SETTINGS },
      selectedDate: TUESDAY,
      undoStack: [],
      redoStack: [],
      lastToast: null,
      toastHandler: null,
    });
    const store = useStore.getState();
    // Drag the run later (weekday scope), neighbour auto-shifts for today.
    await store.moveBlock('blk-run', TUESDAY, 480, 'weekday');
    await store.moveBlock('blk-yoga', TUESDAY, 510, 'today');
    expect(useStore.getState().dayOverrides[TUESDAY]).toHaveLength(2);

    // Later weekday edits to the run must stay visible, not frozen by the override.
    await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');
    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.title).toBe('Tuesday run club');
    await store.moveBlock('blk-run', TUESDAY, 500, 'weekday');
    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)[0]?.startMin).toBe(500);
    // The neighbour's today-only shifted position is preserved.
    expect(after.getBlocksForDate(TUESDAY)[1]?.startMin).toBe(510);
    // Other weekdays never moved.
    expect(after.getBlocksForDate(WEDNESDAY)[0]?.startMin).toBe(420);
  });

  it('swapping two blocks with weekday scope swaps only that weekday', async () => {
    const yoga: Block & { weekdays: number[] } = {
      id: 'blk-yoga',
      categoryId: 'cat-workout',
      title: 'Yoga',
      startMin: 480,
      durationMin: 30,
      weekdays: [1, 2, 3, 4, 5],
    };
    useStore.setState({
      hydrated: true,
      categories: [...DEFAULT_CATEGORIES],
      templates: [
        {
          id: 'tpl-1',
          name: 'My routine',
          effectiveFrom: '2026-11-09',
          blocks: [templateBlock(), yoga],
        },
      ],
      activeTemplateId: 'tpl-1',
      dayOverrides: {},
      completions: [],
      settings: { ...DEFAULT_SETTINGS },
      selectedDate: TUESDAY,
      undoStack: [],
      redoStack: [],
      lastToast: null,
      toastHandler: null,
    });
    const store = useStore.getState();
    await store.moveBlock('blk-run', TUESDAY, 480, 'weekday');
    await store.moveBlock('blk-yoga', TUESDAY, 420, 'weekday');

    const after = useStore.getState();
    const tuesday = after.getBlocksForDate(TUESDAY);
    expect(tuesday.find((b) => b.id === 'blk-run')?.startMin).toBe(480);
    expect(tuesday.find((b) => b.id === 'blk-yoga')?.startMin).toBe(420);
    const wednesday = after.getBlocksForDate(WEDNESDAY);
    expect(wednesday.find((b) => b.title === 'Morning run')?.startMin).toBe(420);
    // Wednesday's yoga is the remainder block (fresh id after the split).
    expect(wednesday.find((b) => b.title === 'Yoga')?.startMin).toBe(480);
    // …and the ids prove it: Wednesday resolves via remainder blocks, not
    // the originals (a re-id regression preserving values would fail here).
    expect(wednesday.find((b) => b.title === 'Morning run')?.id).not.toBe('blk-run');
    expect(wednesday.find((b) => b.title === 'Yoga')?.id).not.toBe('blk-yoga');
  });

  it('an undo batch groups a patch + resize into one undo entry', async () => {
    seedStore();
    const store = useStore.getState();
    store.beginUndoBatch();
    try {
      await store.patchBlock('blk-run', TUESDAY, { title: 'Tuesday run club' }, 'weekday');
      await store.resizeBlock('blk-run', TUESDAY, 45, 'weekday');
    } finally {
      store.endUndoBatch();
    }
    expect(useStore.getState().undoStack).toHaveLength(1);
    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.title).toBe('Tuesday run club');
    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.durationMin).toBe(45);

    await useStore.getState().undo();
    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Morning run');
    expect(after.getBlocksForDate(TUESDAY)[0]?.durationMin).toBe(30);
    expect(after.undoStack).toHaveLength(0);
  });

  it('a create-with-shift groups into one undo entry (applyCreated sequence)', async () => {
    seedStore();
    const store = useStore.getState();
    store.beginUndoBatch();
    try {
      await store.addBlock(
        { categoryId: 'cat-learning', title: 'Read', startMin: 460, durationMin: 30 },
        TUESDAY,
        'today',
      );
      await store.moveBlock('blk-run', TUESDAY, 450, 'today');
    } finally {
      store.endUndoBatch();
    }
    expect(useStore.getState().undoStack).toHaveLength(1);
    expect(useStore.getState().getBlocksForDate(TUESDAY)).toHaveLength(2);

    await useStore.getState().undo();
    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)).toHaveLength(1);
    expect(after.getBlocksForDate(TUESDAY)[0]?.startMin).toBe(420);
  });

  it('a stale override id is re-keyed on split, so later onwards edits hit the right copy', async () => {
    seedStore();
    const store = useStore.getState();
    // Monday: today-only drag → Monday override holds blk-run.
    await store.moveBlock('blk-run', '2026-11-09', 500, 'today');
    // Tuesday: weekday drag → split; Tuesday keeps blk-run, remainder takes Mon/Wed/Thu/Fri.
    await store.moveBlock('blk-run', TUESDAY, 480, 'weekday');

    const afterSplit = useStore.getState();
    const mondayId = afterSplit.getBlocksForDate('2026-11-09')[0]!.id;
    expect(mondayId).not.toBe('blk-run');
    expect(afterSplit.getBlocksForDate('2026-11-09')[0]?.startMin).toBe(500);

    // Monday onwards-rename via the resolved (remainder) id renames the
    // remainder everywhere — Tuesday's copy keeps its title.
    await store.patchBlock(mondayId, '2026-11-09', { title: 'Run club' }, 'onwards');
    const after = useStore.getState();
    expect(after.getBlocksForDate(WEDNESDAY)[0]?.title).toBe('Run club');
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Morning run');
    expect(after.getBlocksForDate('2026-11-09')[0]?.title).toBe('Run club');
  });

  it('a stale id passed directly resolves through the split chain', async () => {
    seedStore();
    const store = useStore.getState();
    await store.moveBlock('blk-run', '2026-11-09', 500, 'today');
    await store.moveBlock('blk-run', TUESDAY, 480, 'weekday');

    // 'blk-run' now recurs Tuesdays only, but the Monday block is its
    // remainder (splitFromId chain) — an onwards rename must hit the
    // remainder, not Tuesday's copy.
    await store.patchBlock('blk-run', '2026-11-09', { title: 'Run club' }, 'onwards');
    const after = useStore.getState();
    expect(after.lastToast).toBe('Updated from today onwards.');
    expect(after.getBlocksForDate(WEDNESDAY)[0]?.title).toBe('Run club');
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Morning run');
    expect(after.getBlocksForDate('2026-11-09')[0]?.title).toBe('Run club');
    // …and a weekday drag with the stale id splits the remainder for Monday.
    await store.moveBlock('blk-run', '2026-11-09', 510, 'weekday');
    const afterDrag = useStore.getState();
    expect(afterDrag.getBlocksForDate('2026-11-09')).toHaveLength(1);
    expect(afterDrag.getBlocksForDate('2026-11-09')[0]?.startMin).toBe(510);
    expect(afterDrag.getBlocksForDate(WEDNESDAY)[0]?.startMin).toBe(420);
    expect(afterDrag.templates[0].blocks).toHaveLength(3);
  });

  it('falls back to today-only when the block only exists in an override', async () => {
    const overrideBlock: Block = {
      id: 'blk-once',
      categoryId: 'cat-food',
      title: 'One-off lunch',
      startMin: 780,
      durationMin: 30,
    };
    seedStore({ [TUESDAY]: [overrideBlock] });
    const store = useStore.getState();
    await store.patchBlock('blk-once', TUESDAY, { title: 'One-off brunch' }, 'onwards');

    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY).find((b) => b.id === 'blk-once')?.title).toBe(
      'One-off brunch',
    );
    // Template untouched — the override-only block was never added to it.
    expect(after.templates[0].blocks).toHaveLength(1);
    expect(after.lastToast).toBe(
      'That block only exists today, so it updated for today only.',
    );
  });

  it('keeps the block id (and its completion) intact', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { notes: 'Easy pace' }, 'today');

    const after = useStore.getState();
    const patched = after.getBlocksForDate(TUESDAY)[0];
    expect(patched?.id).toBe('blk-run');
    expect(patched?.notes).toBe('Easy pace');
    expect(after.getCompletion('blk-run', TUESDAY)?.status).toBe('complete');
  });

  it('undo restores the pre-patch blocks', async () => {
    seedStore();
    const store = useStore.getState();
    await store.patchBlock('blk-run', TUESDAY, { title: 'Morning jog' }, 'today');
    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.title).toBe('Morning jog');

    await useStore.getState().undo();
    const after = useStore.getState();
    expect(after.getBlocksForDate(TUESDAY)[0]?.title).toBe('Morning run');
    expect(after.dayOverrides[TUESDAY]).toBeUndefined();
  });
});
