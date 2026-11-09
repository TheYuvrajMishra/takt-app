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
    // Original lost Tuesday; the split copy recurs on Tuesday only.
    const blocks = after.templates[0].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks.find((b) => b.id === 'blk-run')?.weekdays).toEqual([1, 3, 4, 5]);
    expect(blocks.find((b) => b.id !== 'blk-run')?.weekdays).toEqual([2]);
    expect(after.lastToast).toBe('Updated for this weekday onwards.');
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
