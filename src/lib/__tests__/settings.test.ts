// Settings "Do not nudge" defaults (src/store/useStore.ts addBlock +
// src/app/settings.tsx): the defaults live in Settings (persisted via
// sqlite) and apply to blocks added afterwards.
// 2026-11-10 is a Tuesday (weekday 2).
import { describe, expect, it, vi, beforeEach } from 'vitest';

const dbCalls = vi.hoisted(() => ({ run: [] as unknown[][], failNext: 0 }));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async () => []),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async (...args: unknown[]) => {
      dbCalls.run.push(args);
      if (dbCalls.failNext > 0) {
        dbCalls.failNext -= 1;
        throw new Error('sqlite write failed');
      }
      return { changes: 0, lastInsertRowId: 0 };
    }),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  })),
}));

import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../../types';
import { useStore } from '../../store/useStore';
import { mergeBackupSettings } from '../backup';

const TUESDAY = '2026-11-10';

beforeEach(() => {
  dbCalls.run.length = 0;
  dbCalls.failNext = 0;
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
    selectedDate: TUESDAY,
    undoStack: [],
    redoStack: [],
    lastToast: null,
    toastHandler: null,
  });
}

describe('do-not-nudge defaults', () => {
  it('updateSettings persists the defaults in state and in sqlite', async () => {
    seedStore();
    await useStore
      .getState()
      .updateSettings({ defaultDoNotNudge: true, doNotNudgeCategoryIds: ['cat-gaming'] });

    const { settings } = useStore.getState();
    expect(settings.defaultDoNotNudge).toBe(true);
    expect(settings.doNotNudgeCategoryIds).toEqual(['cat-gaming']);
    const saved = dbCalls.run.find(
      (args) =>
        typeof args[0] === 'string' && (args[0] as string).includes('INSERT INTO settings'),
    );
    expect(saved).toBeDefined();
    expect(JSON.parse(saved![2] as string)).toMatchObject({
      defaultDoNotNudge: true,
      doNotNudgeCategoryIds: ['cat-gaming'],
    });
  });

  it('rapid toggles each see the latest state (no lost update)', async () => {
    seedStore();
    // Default list contains cat-sleep. Two taps without awaiting in
    // between must end where they started — not both remove it.
    const toggle = () => {
      const current = useStore.getState().settings.doNotNudgeCategoryIds;
      const id = 'cat-sleep';
      return useStore.getState().updateSettings({
        doNotNudgeCategoryIds: current.includes(id)
          ? current.filter((c) => c !== id)
          : [...current, id],
      });
    };
    const p1 = toggle();
    const p2 = toggle();
    await Promise.all([p1, p2]);
    expect(useStore.getState().settings.doNotNudgeCategoryIds).toContain('cat-sleep');
  });

  it('a failed earlier save does not clobber a later successful toggle', async () => {
    seedStore();
    dbCalls.failNext = 1; // only the first write fails
    const p1 = useStore.getState().updateSettings({ defaultDoNotNudge: true });
    const p2 = useStore
      .getState()
      .updateSettings({ doNotNudgeCategoryIds: ['cat-gaming'] });
    await Promise.all([p1, p2]);
    // p2's save persisted the merged state, so both changes survive.
    const { settings } = useStore.getState();
    expect(settings.defaultDoNotNudge).toBe(true);
    expect(settings.doNotNudgeCategoryIds).toEqual(['cat-gaming']);
  });

  it('a global default marks new blocks do-not-nudge (today scope)', async () => {
    seedStore();
    await useStore.getState().updateSettings({ defaultDoNotNudge: true });
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30 },
      TUESDAY,
      'today',
    );

    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.doNotNudge).toBe(true);
  });

  it('a category default marks only that category (today scope)', async () => {
    seedStore();
    // DEFAULT_SETTINGS already lists cat-sleep.
    await useStore.getState().addBlock(
      { categoryId: 'cat-sleep', title: 'Nap', startMin: 900, durationMin: 30 },
      TUESDAY,
      'today',
    );
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30 },
      TUESDAY,
      'today',
    );

    const blocks = useStore.getState().getBlocksForDate(TUESDAY);
    expect(blocks.find((b) => b.categoryId === 'cat-sleep')?.doNotNudge).toBe(true);
    expect(blocks.find((b) => b.categoryId === 'cat-workout')?.doNotNudge).toBe(false);
  });

  it('an explicit doNotNudge:false beats a true default', async () => {
    seedStore();
    await useStore.getState().updateSettings({ defaultDoNotNudge: true });
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30, doNotNudge: false },
      TUESDAY,
      'today',
    );

    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.doNotNudge).toBe(false);
  });

  it('defaults apply to template blocks too (onwards scope)', async () => {
    seedStore();
    await useStore.getState().updateSettings({ defaultDoNotNudge: true });
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30 },
      TUESDAY,
      'onwards',
    );

    const after = useStore.getState();
    expect(after.templates[0].blocks[0]?.doNotNudge).toBe(true);
    expect(after.getBlocksForDate(TUESDAY)[0]?.doNotNudge).toBe(true);
  });

  it('defaults apply to weekday-scope template blocks too', async () => {
    seedStore();
    await useStore.getState().updateSettings({ defaultDoNotNudge: true });
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30 },
      TUESDAY,
      'weekday',
    );

    const after = useStore.getState();
    expect(after.templates[0].blocks[0]?.doNotNudge).toBe(true);
    expect(after.templates[0].blocks[0]?.weekdays).toEqual([2]);
  });

  it('an explicit doNotNudge:true beats a false default', async () => {
    seedStore();
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30, doNotNudge: true },
      TUESDAY,
      'today',
    );

    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.doNotNudge).toBe(true);
  });

  it('with defaults off, new blocks nudge', async () => {
    seedStore();
    await useStore.getState().addBlock(
      { categoryId: 'cat-workout', title: 'Run', startMin: 420, durationMin: 30 },
      TUESDAY,
      'today',
    );

    expect(useStore.getState().getBlocksForDate(TUESDAY)[0]?.doNotNudge).toBe(false);
  });
});

describe('mergeBackupSettings', () => {
  it('folds old top-level fields into settings', () => {
    expect(
      mergeBackupSettings(
        { dndDefault: true, dndCats: ['cat-sleep'] },
        ['cat-sleep', 'cat-job'],
      ),
    ).toEqual({
      defaultDoNotNudge: true,
      doNotNudgeCategoryIds: ['cat-sleep'],
    });
  });

  it('drops stale category ids from restored settings', () => {
    expect(
      mergeBackupSettings(
        { settings: { doNotNudgeCategoryIds: ['cat-gone', 'cat-job'] } },
        ['cat-job'],
      ),
    ).toEqual({ doNotNudgeCategoryIds: ['cat-job'] });
  });

  it('returns empty for an empty backup', () => {
    expect(mergeBackupSettings({}, ['cat-job'])).toEqual({});
  });

  it('omits the list when every id is stale instead of wiping it', () => {
    expect(
      mergeBackupSettings({ dndCats: ['cat-gone'] }, ['cat-job']),
    ).toEqual({});
    expect(
      mergeBackupSettings(
        { settings: { doNotNudgeCategoryIds: ['cat-gone'] } },
        ['cat-job'],
      ),
    ).toEqual({});
  });

  it('applies an explicitly empty list', () => {
    expect(
      mergeBackupSettings(
        { settings: { doNotNudgeCategoryIds: [] } },
        ['cat-job'],
      ),
    ).toEqual({ doNotNudgeCategoryIds: [] });
  });

  it('drops non-array lists and non-boolean defaults', () => {
    expect(
      mergeBackupSettings(
        {
          settings: {
            defaultDoNotNudge: 'yes' as unknown as boolean,
            doNotNudgeCategoryIds: 'cat-job' as unknown as string[],
          },
        },
        ['cat-job'],
      ),
    ).toEqual({});
  });

  it('new-format settings win over legacy top-level fields', () => {
    expect(
      mergeBackupSettings(
        {
          settings: { doNotNudgeCategoryIds: ['cat-job'] },
          dndCats: ['cat-sleep'],
        },
        ['cat-job', 'cat-sleep'],
      ),
    ).toEqual({ doNotNudgeCategoryIds: ['cat-job'] });
  });
});
