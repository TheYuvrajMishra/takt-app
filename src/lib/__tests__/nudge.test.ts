// Pure-logic tests for the nudge engine (src/lib/nudge.ts) and the
// template-scope / versioning helpers (src/store/useStore.ts).
// Native modules are mocked: no real notifications or sqlite are touched.
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER: 'default',
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => null),
  setNotificationCategoryAsync: vi.fn(async () => ({})),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: vi.fn(async () => 'mock-id'),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: () => {} })),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async () => []),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
  })),
}));

import type { Block, CompletionEntry, RoutineTemplate, Settings } from '../../types';
import {
  buildNudgePlan,
  makeNudgeId,
  nudgeCopy,
  parseNudgeId,
} from '../nudge';
import {
  removeTemplateBlock,
  removeWeekdayFromTemplate,
  resolveBlocksForDate,
  resolveTemplateForDate,
  splitTemplateBlockForWeekday,
  updateTemplateBlock,
} from '../../store/useStore';

// 2026-11-10 is a Tuesday (weekday 2); 2026-11-11 is Wednesday (3).
const TUESDAY = '2026-11-10';
const WEDNESDAY = '2026-11-11';

const TEST_SETTINGS: Settings = {
  nudgeIntervalMin: 60,
  maxNudgesPerBlock: 3,
  perDayNudgeCap: 40,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  onboardingDone: true,
  haptics: true,
  reduceMotion: false,
  largeText: false,
  defaultDoNotNudge: false,
  doNotNudgeCategoryIds: [],
};

function block(
  id: string,
  startMin: number,
  durationMin: number,
  extra: Partial<Block> = {},
): Block {
  return { id, categoryId: 'cat-job', title: `Block ${id}`, startMin, durationMin, ...extra };
}

function templateBlock(
  id: string,
  startMin: number,
  durationMin: number,
  weekdays: number[],
) {
  return { id, categoryId: 'cat-job', title: `Block ${id}`, startMin, durationMin, weekdays };
}

function template(
  id: string,
  effectiveFrom: string,
  blocks: ReturnType<typeof templateBlock>[],
): RoutineTemplate {
  return { id, name: id, effectiveFrom, blocks };
}

/** "Now": Tuesday 2026-11-10, 08:00 local. */
function nowAt(hour: number, minute = 0): Date {
  return new Date(2026, 10, 10, hour, minute, 0, 0);
}

describe('makeNudgeId / parseNudgeId', () => {
  it('round-trips block ids that contain hyphens', () => {
    const id = makeNudgeId('blk-abc-1', TUESDAY, 2);
    expect(id).toBe('takt-2026-11-10-blk-abc-1-2');
    expect(parseNudgeId(id)).toEqual({
      blockId: 'blk-abc-1',
      date: TUESDAY,
      index: 2,
    });
  });

  it('rejects non-Takt identifiers', () => {
    expect(parseNudgeId('other-2026-11-10-x-0')).toBe(null);
    expect(parseNudgeId('takt-not-a-date-x-0')).toBe(null);
    expect(parseNudgeId('takt-2026-11-10')).toBe(null);
  });
});

describe('nudgeCopy', () => {
  it('escalates with the nudge index and stays polite', () => {
    const first = nudgeCopy('Deep work', 0);
    const later = nudgeCopy('Deep work', 3);
    expect(first.title).toContain('Deep work');
    expect(first.body).toMatch(/starts now/);
    expect(later.title).not.toBe(first.title);
    expect(later.body).toMatch(/nudge 4/);
    for (const copy of [first, later, nudgeCopy('Deep work', 1)]) {
      expect(copy.title + copy.body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe('buildNudgePlan', () => {
  it('schedules one nudge per nudgeTimes slot inside the 48h window', () => {
    // 09:00–09:30, interval 60: slots 540 and 600.
    const plan = buildNudgePlan({
      blocksByDate: {
        [TUESDAY]: [block('a', 540, 30)],
        [WEDNESDAY]: [block('b', 540, 30)],
      },
      completions: [],
      settings: TEST_SETTINGS,
      now: nowAt(8),
    });
    expect(plan.map((p) => p.identifier)).toEqual([
      'takt-2026-11-10-a-0',
      'takt-2026-11-10-a-1',
      'takt-2026-11-11-b-0',
      'takt-2026-11-11-b-1',
    ]);
    expect(plan[0].fireAt.getHours()).toBe(9);
    expect(plan[0].copyIndex).toBe(0);
    expect(plan[1].copyIndex).toBe(1);
  });

  it('ignores blocks outside the 48h window', () => {
    const plan = buildNudgePlan({
      blocksByDate: { '2026-11-12': [block('a', 540, 30)] },
      completions: [],
      settings: TEST_SETTINGS,
      now: nowAt(8),
    });
    expect(plan).toEqual([]);
  });

  it('skips past times', () => {
    // 07:00–07:30 with now at 08:00: slots 420 and 480 are both past/at now.
    const plan = buildNudgePlan({
      blocksByDate: { [TUESDAY]: [block('a', 420, 30)] },
      completions: [],
      settings: TEST_SETTINGS,
      now: nowAt(8),
    });
    expect(plan).toEqual([]);
  });

  it('skips done and skipped blocks, but still nudges in-progress ones', () => {
    const completions: CompletionEntry[] = [
      { blockId: 'done', date: TUESDAY, status: 'complete', onTime: true },
      { blockId: 'skip', date: TUESDAY, status: 'skipped' },
      { blockId: 'prog', date: TUESDAY, status: 'progress' },
    ];
    const plan = buildNudgePlan({
      blocksByDate: {
        [TUESDAY]: [
          block('done', 540, 30),
          block('skip', 660, 30),
          block('prog', 780, 30),
        ],
      },
      completions,
      settings: TEST_SETTINGS,
      now: nowAt(8),
    });
    expect(plan.map((p) => p.blockId)).toEqual(['prog', 'prog']);
  });

  it('respects doNotNudge', () => {
    const plan = buildNudgePlan({
      blocksByDate: {
        [TUESDAY]: [block('a', 540, 30, { doNotNudge: true })],
      },
      completions: [],
      settings: TEST_SETTINGS,
      now: nowAt(8),
    });
    expect(plan).toEqual([]);
  });

  it('drops slots inside quiet hours', () => {
    // 22:30–23:00: slots 1350 and 1410 are both inside 22:00–07:00.
    // 06:30–07:00: slot 390 is inside quiet hours, slot 450 is not.
    const plan = buildNudgePlan({
      blocksByDate: {
        [TUESDAY]: [block('late', 1350, 30)],
        [WEDNESDAY]: [block('early', 390, 30)],
      },
      completions: [],
      settings: TEST_SETTINGS,
      now: nowAt(8),
    });
    expect(plan.map((p) => p.blockId)).toEqual(['early']);
    expect(plan[0].fireAt.getHours()).toBe(7);
    expect(plan[0].fireAt.getMinutes()).toBe(30);
  });

  it('enforces the per-day cap, earliest first', () => {
    const plan = buildNudgePlan({
      blocksByDate: {
        [TUESDAY]: [
          block('a', 540, 30),
          block('b', 660, 30),
          block('c', 780, 30),
        ],
      },
      completions: [],
      settings: { ...TEST_SETTINGS, perDayNudgeCap: 2 },
      now: nowAt(8),
    });
    expect(plan.map((p) => p.identifier)).toEqual([
      'takt-2026-11-10-a-0',
      'takt-2026-11-10-a-1',
    ]);
  });

  it('respects maxNudgesPerBlock', () => {
    const plan = buildNudgePlan({
      blocksByDate: { [TUESDAY]: [block('a', 540, 30)] },
      completions: [],
      settings: { ...TEST_SETTINGS, maxNudgesPerBlock: 1 },
      now: nowAt(8),
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].copyIndex).toBe(0);
  });
});

describe('template versioning (resolveTemplateForDate)', () => {
  it('picks the latest template effective on or before the date', () => {
    const templates = [
      template('old', '2026-11-01', []),
      template('new', '2026-11-09', []),
    ];
    expect(resolveTemplateForDate(TUESDAY, templates)?.id).toBe('new');
    expect(resolveTemplateForDate('2026-11-05', templates)?.id).toBe('old');
  });

  it('returns null when no template is effective yet', () => {
    const templates = [template('future', '2026-12-01', [])];
    expect(resolveTemplateForDate(TUESDAY, templates)).toBe(null);
  });

  it('returns null with no templates', () => {
    expect(resolveTemplateForDate(TUESDAY, [])).toBe(null);
  });
});

describe('day resolution (resolveBlocksForDate)', () => {
  it('an override wins over the template', () => {
    const templates = [
      template('t', '2026-11-01', [templateBlock('a', 540, 30, [2])]),
    ];
    const override = [block('custom', 600, 45)];
    const resolved = resolveBlocksForDate(
      TUESDAY,
      templates,
      { [TUESDAY]: override },
    );
    expect(resolved).toEqual(override);
  });

  it('filters template blocks by weekday and tags the template id', () => {
    const templates = [
      template('t', '2026-11-01', [
        templateBlock('tue', 540, 30, [2]),
        templateBlock('wed', 600, 30, [3]),
      ]),
    ];
    const resolved = resolveBlocksForDate(TUESDAY, templates, {});
    expect(resolved.map((b) => b.id)).toEqual(['tue']);
    expect(resolved[0].templateBlockId).toBe('tue');
    expect(resolved[0]).not.toHaveProperty('weekdays');
  });

  it('returns no blocks when the template is not yet effective', () => {
    const templates = [
      template('t', '2026-11-11', [templateBlock('a', 540, 30, [2])]),
    ];
    expect(resolveBlocksForDate(TUESDAY, templates, {})).toEqual([]);
  });
});

describe('scope edits on templates', () => {
  const base = template('t', '2026-11-01', [
    templateBlock('a', 540, 30, [1, 2, 3]),
  ]);

  it('updateTemplateBlock patches one block everywhere (onwards)', () => {
    const next = updateTemplateBlock(base, 'a', { startMin: 600 });
    expect(next.blocks[0].startMin).toBe(600);
    expect(next.blocks[0].weekdays).toEqual([1, 2, 3]);
  });

  it('removeTemplateBlock drops the block (onwards delete)', () => {
    expect(removeTemplateBlock(base, 'a').blocks).toEqual([]);
  });

  it('splitTemplateBlockForWeekday keeps other weekdays and copies the one', () => {
    const { template: next, remainderId } = splitTemplateBlockForWeekday(base, 'a', 2, { startMin: 660 });
    expect(next.blocks).toHaveLength(2);
    const [remainder, copy] = next.blocks;
    expect(remainder.weekdays).toEqual([1, 3]);
    expect(remainder.startMin).toBe(540);
    // The remainder (other weekdays) gets the fresh id; the edited weekday's
    // copy KEEPS the original id so its completions keep matching.
    expect(remainder.id).not.toBe('a');
    expect(remainder.id).toBe(remainderId);
    expect(remainder.splitFromId).toBe('a');
    expect(copy.weekdays).toEqual([2]);
    expect(copy.startMin).toBe(660);
    expect(copy.id).toBe('a');
    expect(copy.splitFromId).toBeUndefined();
    // The split resolves correctly: Tuesday shows the moved copy only.
    const tuesday = resolveBlocksForDate(TUESDAY, [next], {});
    expect(tuesday.map((b) => b.startMin)).toEqual([660]);
    const monday = resolveBlocksForDate('2026-11-09', [next], {});
    expect(monday.map((b) => b.startMin)).toEqual([540]);
  });

  it('splitTemplateBlockForWeekday patches in place when the block recurs only on that weekday', () => {
    const solo = template('t', '2026-11-01', [
      templateBlock('a', 540, 30, [2]),
    ]);
    const { template: next, remainderId } = splitTemplateBlockForWeekday(solo, 'a', 2, { startMin: 660 });
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0].id).toBe('a');
    expect(next.blocks[0].startMin).toBe(660);
    expect(next.blocks[0].weekdays).toEqual([2]);
    expect(remainderId).toBeNull();
  });

  it('removeWeekdayFromTemplate drops the weekday, then the block', () => {
    const once = removeWeekdayFromTemplate(base, 'a', 2);
    expect(once.blocks[0].weekdays).toEqual([1, 3]);
    const gone = removeWeekdayFromTemplate(
      template('t', '2026-11-01', [templateBlock('a', 540, 30, [2])]),
      'a',
      2,
    );
    expect(gone.blocks).toEqual([]);
  });
});
