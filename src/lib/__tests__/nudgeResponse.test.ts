// Tests for the notification-response paths (src/lib/nudge.ts):
// Done must cancel only that block-date and keep tomorrow's nudges for the
// same recurring block id; tapping the body opens Today; Start rebuilds
// with wrap-up nudges only. The store and expo-notifications are mocked;
// the clock is faked to Tuesday 2026-11-10 02:30 so the plan is
// deterministic (never depend on the real wall clock here).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notifMocks = vi.hoisted(() => {
  const scheduled: { identifier: string }[] = [];
  return {
    scheduled,
    schedule: vi.fn(async () => 'mock-id'),
    cancel: vi.fn(async () => undefined),
    getScheduled: vi.fn(async () => [...scheduled]),
    getPermissions: vi.fn(async () => ({ status: 'granted' as const })),
  };
});

vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER: 'default',
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => null),
  setNotificationCategoryAsync: vi.fn(async () => ({})),
  getPermissionsAsync: notifMocks.getPermissions,
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: notifMocks.schedule,
  cancelScheduledNotificationAsync: notifMocks.cancel,
  getAllScheduledNotificationsAsync: notifMocks.getScheduled,
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: () => {} })),
}));

const storeMocks = vi.hoisted(() => {
  const completions: Array<{
    blockId: string;
    date: string;
    status: 'complete' | 'progress' | 'skipped';
  }> = [];
  return {
    completions,
    markDone: vi.fn(async (blockId: string, date: string) => {
      completions.push({ blockId, date, status: 'complete' });
    }),
    markStarted: vi.fn(async (blockId: string, date: string) => {
      completions.push({ blockId, date, status: 'progress' });
    }),
    snooze: vi.fn(async () => undefined),
    // The same recurring block id ('a') on today and tomorrow, 09:00–09:30.
    getBlocksForDate: (date: string) =>
      date === '2026-11-10' || date === '2026-11-11'
        ? [
            {
              id: 'a',
              categoryId: 'cat-job',
              title: 'Block a',
              startMin: 540,
              durationMin: 30,
            },
          ]
        : [],
    settings: {
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
    },
  };
});

vi.mock('../../store/useStore', () => ({
  useStore: { getState: () => storeMocks },
  setAfterChangeHook: vi.fn(),
}));

import {
  cancelNudgesForBlockOnDate,
  handleNudgeResponse,
  reschedule,
} from '../nudge';

type ResponseArg = Parameters<typeof handleNudgeResponse>[0];

function responseFor(actionIdentifier: string): ResponseArg {
  return {
    notification: {
      request: {
        identifier: 'takt-2026-11-10-a-0',
        content: { data: { blockId: 'a', date: '2026-11-10' } },
      },
    },
    actionIdentifier,
  } as unknown as ResponseArg;
}

function scheduledIds(): string[] {
  return notifMocks.schedule.mock.calls.map(
    (c) => (c as unknown as [{ identifier: string }])[0].identifier,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 10, 2, 30, 0, 0));
  notifMocks.scheduled.length = 0;
  storeMocks.completions.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cancelNudgesForBlockOnDate', () => {
  it('touches only that date, never tomorrow for the same block id', async () => {
    notifMocks.scheduled.push(
      { identifier: 'takt-2026-11-10-a-0' },
      { identifier: 'takt-2026-11-10-a-1' },
      { identifier: 'takt-2026-11-11-a-0' },
      { identifier: 'takt-2026-11-11-a-1' },
      { identifier: 'other-thing' },
    );
    await cancelNudgesForBlockOnDate('a', '2026-11-10');
    expect(notifMocks.cancel).toHaveBeenCalledTimes(2);
    expect(notifMocks.cancel).toHaveBeenCalledWith('takt-2026-11-10-a-0');
    expect(notifMocks.cancel).toHaveBeenCalledWith('takt-2026-11-10-a-1');
    expect(notifMocks.cancel).not.toHaveBeenCalledWith('takt-2026-11-11-a-0');
  });
});

describe('handleNudgeResponse', () => {
  it('Done cancels only today and keeps tomorrow scheduled', async () => {
    notifMocks.scheduled.push(
      { identifier: 'takt-2026-11-10-a-0' },
      { identifier: 'takt-2026-11-10-a-1' },
      { identifier: 'takt-2026-11-11-a-0' },
      { identifier: 'takt-2026-11-11-a-1' },
    );
    const result = await handleNudgeResponse(responseFor('done'));
    expect(result).toBe('done');
    expect(storeMocks.markDone).toHaveBeenCalledWith('a', '2026-11-10');
    // Today's ids are cancelled; tomorrow's are never cancelled...
    expect(notifMocks.cancel).toHaveBeenCalledWith('takt-2026-11-10-a-0');
    expect(notifMocks.cancel).toHaveBeenCalledWith('takt-2026-11-10-a-1');
    expect(notifMocks.cancel).not.toHaveBeenCalledWith('takt-2026-11-11-a-0');
    expect(notifMocks.cancel).not.toHaveBeenCalledWith('takt-2026-11-11-a-1');
    // ...and the rebuild (re)schedules tomorrow's nudges, not today's.
    expect(scheduledIds()).toContain('takt-2026-11-11-a-0');
    expect(scheduledIds()).toContain('takt-2026-11-11-a-1');
    expect(scheduledIds()).not.toContain('takt-2026-11-10-a-0');
    expect(scheduledIds()).not.toContain('takt-2026-11-10-a-1');
  });

  it('tapping the notification body returns opened and changes nothing', async () => {
    const result = await handleNudgeResponse(responseFor('default'));
    expect(result).toBe('opened');
    expect(storeMocks.markDone).not.toHaveBeenCalled();
    expect(storeMocks.markStarted).not.toHaveBeenCalled();
    expect(notifMocks.schedule).not.toHaveBeenCalled();
  });

  it('Start rebuilds with wrap-up nudges only for today', async () => {
    const result = await handleNudgeResponse(responseFor('start'));
    expect(result).toBe('started');
    expect(storeMocks.markStarted).toHaveBeenCalledWith('a', '2026-11-10');
    // Today 09:00–09:30, interval 60: slots 540 and 600; started keeps
    // only the post-end slot (600, identifier index 1).
    expect(scheduledIds()).toContain('takt-2026-11-10-a-1');
    expect(scheduledIds()).not.toContain('takt-2026-11-10-a-0');
    // Tomorrow is untouched: both slots still scheduled.
    expect(scheduledIds()).toContain('takt-2026-11-11-a-0');
    expect(scheduledIds()).toContain('takt-2026-11-11-a-1');
  });

  it('tapping a test nudge (no block data) still opens the app', async () => {
    const res = {
      notification: {
        request: {
          identifier: 'test-123',
          content: { data: { test: true } },
        },
      },
      actionIdentifier: 'default',
    } as unknown as ResponseArg;
    expect(await handleNudgeResponse(res)).toBe('opened');
  });

  it('Snooze returns snoozed', async () => {
    const result = await handleNudgeResponse(responseFor('snooze-10'));
    expect(result).toBe('snoozed');
    expect(storeMocks.snooze).toHaveBeenCalledWith('a', '2026-11-10', 10);
  });
});

describe('reschedule', () => {
  it('cancels stale identifiers and keeps planned ones (schedule-first sweep)', async () => {
    notifMocks.scheduled.push(
      { identifier: 'takt-2026-11-10-gone-0' },
      { identifier: 'takt-2026-11-11-a-0' },
    );
    const count = await reschedule();
    expect(count).toBe(4);
    expect(notifMocks.cancel).toHaveBeenCalledWith('takt-2026-11-10-gone-0');
    expect(notifMocks.cancel).not.toHaveBeenCalledWith('takt-2026-11-11-a-0');
    expect(scheduledIds()).toContain('takt-2026-11-11-a-0');
  });
});
