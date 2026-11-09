// Store-level undo-batch tests: a multi-block user action (duplicate /
// paste / apply-template in Calendar) wraps its loop in one outer
// beginUndoBatch, and the inner per-block batches nest inside it — the
// whole action must cost exactly one undo entry, and one Undo must revert
// all of it. The store is real; only sqlite is mocked (same stub as the
// nudge tests). Each test uses its own date so days stay isolated.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async () => []),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  })),
}));

import { useStore } from '../../store/useStore';

function blockInput(n: number) {
  return {
    categoryId: 'cat-job',
    title: `Block ${n}`,
    startMin: 540 + n * 60,
    durationMin: 30,
  };
}

beforeEach(async () => {
  await useStore.getState().load();
});

describe('undo batching', () => {
  it('a batch wrapping two adds costs one undo entry, and one Undo reverts both', async () => {
    const date = '2026-11-10';
    const s = useStore.getState();
    const before = s.undoStack.length;
    s.beginUndoBatch();
    try {
      await s.addBlock(blockInput(1), date, 'today');
      await s.addBlock(blockInput(2), date, 'today');
    } finally {
      s.endUndoBatch();
    }
    expect(useStore.getState().undoStack.length).toBe(before + 1);
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(2);
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(0);
    expect(useStore.getState().undoStack.length).toBe(before);
  });

  it('two adds without a batch cost two undo entries, undone one at a time', async () => {
    const date = '2026-11-11';
    const s = useStore.getState();
    const before = s.undoStack.length;
    await s.addBlock(blockInput(1), date, 'today');
    await s.addBlock(blockInput(2), date, 'today');
    expect(useStore.getState().undoStack.length).toBe(before + 2);
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(1);
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(0);
  });

  it('nested batches (outer action, inner batch per item, as in Calendar) cost one entry', async () => {
    const date = '2026-11-12';
    const s = useStore.getState();
    const before = s.undoStack.length;
    // Mirrors duplicate/paste/apply-template: one outer batch, and each
    // item's own batch (applyCreated) nested inside it.
    s.beginUndoBatch();
    try {
      for (const n of [1, 2]) {
        s.beginUndoBatch();
        try {
          await s.addBlock(blockInput(n), date, 'today');
        } finally {
          s.endUndoBatch();
        }
      }
    } finally {
      s.endUndoBatch();
    }
    expect(useStore.getState().undoStack.length).toBe(before + 1);
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(2);
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(0);
  });

  it('undo() refuses while a batch is open, so a batch cannot strand', async () => {
    const date = '2026-11-13';
    const s = useStore.getState();
    const base = s.undoStack.length;
    s.beginUndoBatch();
    // Lazy snapshot: nothing is on the stack yet — no mutation has landed.
    expect(useStore.getState().undoStack.length).toBe(base);
    await s.addBlock(blockInput(1), date, 'today');
    // The first mutation took the snapshot.
    expect(useStore.getState().undoStack.length).toBe(base + 1);
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(1);
    expect(useStore.getState().undoStack.length).toBe(base + 1);
    s.endUndoBatch();
    expect(useStore.getState().undoStack.length).toBe(base + 1);
    // Undo works again once the batch closes, and reverts the add.
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(0);
  });

  it('an empty batch plants no undo entry and preserves redo history', async () => {
    const date = '2026-11-14';
    const s = useStore.getState();
    await s.addBlock(blockInput(1), date, 'today');
    await useStore.getState().undo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(0);
    const undoBase = useStore.getState().undoStack.length;
    const redoBase = useStore.getState().redoStack.length;
    expect(redoBase).toBeGreaterThan(0);
    // A paste/duplicate/template with no room: batch opens and closes
    // without any mutation landing.
    s.beginUndoBatch();
    s.endUndoBatch();
    expect(useStore.getState().undoStack.length).toBe(undoBase);
    expect(useStore.getState().redoStack.length).toBe(redoBase);
    // Redo still works: the empty batch did not wipe it.
    await useStore.getState().redo();
    expect(useStore.getState().getBlocksForDate(date)).toHaveLength(1);
  });

  it('actions on a missing block or category plant no undo entry', async () => {
    const date = '2026-11-15';
    const s = useStore.getState();
    const before = s.undoStack.length;
    await s.snooze('no-such-block', date);
    await s.moveBlock('no-such-block', date, 600, 'today');
    await s.resizeBlock('no-such-block', date, 45, 'today');
    await s.patchBlock('no-such-block', date, { title: 'x' }, 'today');
    await s.editCategory('no-such-cat', { name: 'x' });
    await s.deleteCategory('no-such-cat');
    expect(useStore.getState().undoStack.length).toBe(before);
  });
});
