// Regression test for the 2026-11-12 calendar bug: dropping a new task
// on a future date (Sat 14 Nov) and picking "From today onwards" must
// add the task from TODAY (Thu 12 Nov), not from the drop date — the
// scope label promises "from today onwards", and the old code set the
// template's effectiveFrom to the drop date, so the task skipped today
// and tomorrow entirely (appearing only from the 14th).
// Runs the real store method against a mocked sqlite layer (same mock
// as patchBlock.test.ts): state is seeded via useStore.setState, db
// calls no-op.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async () => []),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  })),
}));

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../../types';
import { useStore } from '../../store/useStore';

const TODAY = '2026-11-12'; // Thursday
const TOMORROW = '2026-11-13'; // Friday
const SATURDAY = '2026-11-14'; // the drop date, 2 days out

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T10:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

function seedStore(): void {
  useStore.setState({
    hydrated: true,
    categories: [...DEFAULT_CATEGORIES],
    templates: [],
    activeTemplateId: null,
    dayOverrides: {},
    completions: [],
    settings: { ...DEFAULT_SETTINGS },
    selectedDate: TODAY,
    undoStack: [],
    redoStack: [],
    lastToast: null,
    toastHandler: null,
  });
}

describe('addBlock onwards from a future drop date', () => {
  it('starts the task today, not on the drop date', async () => {
    seedStore();
    const store = useStore.getState();
    await store.addBlock(
      { categoryId: 'cat-workout', title: 'Evening run', startMin: 1080, durationMin: 30 },
      SATURDAY,
      'onwards',
    );

    const after = useStore.getState();
    // The task must appear today (the label's promise) and tomorrow.
    expect(after.getBlocksForDate(TODAY)).toHaveLength(1);
    expect(after.getBlocksForDate(TODAY)[0]?.title).toBe('Evening run');
    expect(after.getBlocksForDate(TOMORROW)).toHaveLength(1);
    expect(after.getBlocksForDate(SATURDAY)).toHaveLength(1);
    // And the template takes effect from today.
    expect(after.templates[0].effectiveFrom).toBe(TODAY);
    expect(after.lastToast).toBe('Added from today onwards.');
  });

  it('still starts from the drop date when the drop date is in the past', async () => {
    seedStore();
    const store = useStore.getState();
    await store.addBlock(
      { categoryId: 'cat-workout', title: 'Old run', startMin: 1080, durationMin: 30 },
      '2026-11-10',
      'onwards',
    );

    const after = useStore.getState();
    expect(after.templates[0].effectiveFrom).toBe('2026-11-10');
    expect(after.getBlocksForDate(TODAY)).toHaveLength(1);
  });
});
