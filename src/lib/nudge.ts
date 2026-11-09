// Takt — nudge engine (expo-notifications SDK 58).
// Schedules a rolling 48h window of nudges from the store's blocks + settings.
// Notification identifiers encode blockId + date + index, so cancellation is exact.
// Copy is escalating but never rude. No emoji anywhere.
import * as Notifications from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import type { Block, CompletionEntry, Settings } from '../types';
import { dateKey, isInQuietHours, nudgeTimes } from './core';
import { setAfterChangeHook, useStore } from '../store/useStore';

export const NUDGE_CHANNEL_ID = 'takt-nudges';
export const NUDGE_CATEGORY_ID = 'takt-block';
export const ACTION_DONE = 'done';
export const ACTION_START = 'start';
export const ACTION_SNOOZE = 'snooze-10';
export const SNOOZE_MINUTES = 10;
export const NUDGE_WINDOW_DAYS = 2;

export interface NudgePlanItem {
  identifier: string;
  blockId: string;
  date: string;
  title: string;
  fireAt: Date;
  copyIndex: number;
  totalForBlock: number;
}

export interface NudgeCopy {
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Identifier encodes block + date + nudge index so cancellation is exact. */
export function makeNudgeId(blockId: string, date: string, index: number): string {
  return `takt-${date}-${blockId}-${index}`;
}

export function parseNudgeId(
  identifier: string,
): { blockId: string; date: string; index: number } | null {
  if (!identifier.startsWith('takt-')) return null;
  const rest = identifier.slice('takt-'.length);
  const parts = rest.split('-');
  if (parts.length < 5) return null;
  // Date is three segments (YYYY-MM-DD); index is the last segment.
  const date = parts.slice(0, 3).join('-');
  const index = Number(parts[parts.length - 1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(index)) return null;
  // Block ids may contain hyphens: everything between the date and the index.
  const blockId = parts.slice(3, -1).join('-');
  if (!blockId) return null;
  return { blockId, date, index };
}

/** Escalating copy. Firm, never rude, no emoji. */
export function nudgeCopy(title: string, index: number): NudgeCopy {
  if (index <= 0) {
    return { title: `Time for ${title}`, body: `Your ${title} block starts now.` };
  }
  if (index === 1) {
    return {
      title: `${title} is waiting`,
      body: `Still time to start ${title}. A small start counts.`,
    };
  }
  if (index === 2) {
    return {
      title: `A gentle push: ${title}`,
      body: `${title} has not started yet. Even five minutes moves the day forward.`,
    };
  }
  return {
    title: `${title} — still open`,
    body: `This is nudge ${index + 1} for ${title}. Start whenever you are ready.`,
  };
}

export interface BuildNudgePlanInput {
  /** Blocks per date (already resolved: override or template). */
  blocksByDate: Record<string, Block[]>;
  completions: CompletionEntry[];
  settings: Settings;
  /** "Now" — injectable so the plan is pure and testable. */
  now: Date;
}

/**
 * Pure plan for the rolling window: for each date from `now` for
 * NUDGE_WINDOW_DAYS days, one nudge per core.nudgeTimes slot, skipping
 * done/skipped blocks, doNotNudge blocks, quiet hours, and past times.
 * Enforces the per-day cap (earliest first).
 */
export function buildNudgePlan(input: BuildNudgePlanInput): NudgePlanItem[] {
  const { blocksByDate, completions, settings, now } = input;
  const doneOrSkipped = new Set(
    completions
      .filter((c) => c.status === 'complete' || c.status === 'skipped')
      .map((c) => `${c.date}:${c.blockId}`),
  );
  const items: NudgePlanItem[] = [];

  for (let dayOffset = 0; dayOffset < NUDGE_WINDOW_DAYS; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    const date = dateKey(day);
    const blocks = [...(blocksByDate[date] ?? [])].sort(
      (a, b) => a.startMin - b.startMin,
    );
    const dayItems: NudgePlanItem[] = [];
    for (const block of blocks) {
      if (block.doNotNudge) continue;
      if (doneOrSkipped.has(`${date}:${block.id}`)) continue;
      const times = nudgeTimes(
        block,
        settings.nudgeIntervalMin,
        settings.maxNudgesPerBlock,
      );
      for (let i = 0; i < times.length; i++) {
        const fireMin = times[i];
        if (isInQuietHours(fireMin, settings.quietHoursStart, settings.quietHoursEnd)) {
          continue;
        }
        const fireAt = new Date(day);
        fireAt.setHours(Math.floor(fireMin / 60), fireMin % 60, 0, 0);
        if (fireAt.getTime() <= now.getTime()) continue;
        dayItems.push({
          identifier: makeNudgeId(block.id, date, i),
          blockId: block.id,
          date,
          title: block.title,
          fireAt,
          copyIndex: i,
          totalForBlock: times.length,
        });
      }
    }
    dayItems.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    items.push(...dayItems.slice(0, settings.perDayNudgeCap));
  }

  items.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return items;
}

// ---------------------------------------------------------------------------
// Native setup
// ---------------------------------------------------------------------------

function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannelAndCategory(): Promise<void> {
  // Android only; on iOS this is a no-op that resolves null — hence try/catch.
  try {
    await Notifications.setNotificationChannelAsync(NUDGE_CHANNEL_ID, {
      name: 'Takt nudges',
      description: 'Reminders to start your scheduled blocks.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      lightColor: '#0A0A0A',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // iOS has no channels; ignore.
  }
  await Notifications.setNotificationCategoryAsync(NUDGE_CATEGORY_ID, [
    { identifier: ACTION_DONE, buttonTitle: 'Done' },
    { identifier: ACTION_START, buttonTitle: 'Start' },
    { identifier: ACTION_SNOOZE, buttonTitle: 'Snooze 10 min' },
  ]);
}

export async function requestNudgePermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const next = await Notifications.requestPermissionsAsync();
  return next.status === 'granted';
}

/**
 * One-time setup for the app root: handler + channel + category + permissions,
 * then wire store changes to reschedule() and schedule the first window.
 * Safe to call repeatedly; returns whether notifications are granted.
 */
export async function initNudges(): Promise<boolean> {
  setupNotificationHandler();
  await ensureChannelAndCategory();
  const granted = await requestNudgePermissions();
  setAfterChangeHook(() => {
    void reschedule();
  });
  if (granted) await reschedule();
  return granted;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function planFromStore(now: Date): NudgePlanItem[] {
  const state = useStore.getState();
  const blocksByDate: Record<string, Block[]> = {};
  for (let dayOffset = 0; dayOffset < NUDGE_WINDOW_DAYS; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    const date = dateKey(day);
    blocksByDate[date] = state.getBlocksForDate(date);
  }
  return buildNudgePlan({
    blocksByDate,
    completions: state.completions,
    settings: state.settings,
    now,
  });
}

async function cancelScheduledTaktNudges(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith('takt-')) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/**
 * Rebuild the rolling 48h window: cancel every Takt nudge, then schedule the
 * fresh plan. Returns how many notifications were scheduled.
 */
export async function reschedule(): Promise<number> {
  const plan = planFromStore(new Date());
  await cancelScheduledTaktNudges();
  for (const item of plan) {
    const copy = nudgeCopy(item.title, item.copyIndex);
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: {
        title: copy.title,
        body: copy.body,
        categoryIdentifier: NUDGE_CATEGORY_ID,
        data: {
          blockId: item.blockId,
          date: item.date,
          copyIndex: item.copyIndex,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.fireAt,
        channelId: NUDGE_CHANNEL_ID,
      },
    });
  }
  return plan.length;
}

/** Cancel every scheduled nudge for one block (all dates, all indices). */
export async function cancelAllForBlock(blockId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const parsed = parseNudgeId(n.identifier);
    if (parsed && parsed.blockId === blockId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** Cancel the scheduled nudges for one block on one date. */
export async function cancelNudgesForBlockOnDate(
  blockId: string,
  date: string,
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    const parsed = parseNudgeId(n.identifier);
    if (parsed && parsed.blockId === blockId && parsed.date === date) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function cancelAllNudges(): Promise<void> {
  await cancelScheduledTaktNudges();
}

// ---------------------------------------------------------------------------
// Responses (Done / Start / Snooze 10) — the app root wires this in.
// ---------------------------------------------------------------------------

/**
 * Handle a tapped notification or action button. Returns what happened so the
 * caller can react (e.g. navigate). The app root wires it like:
 *   Notifications.addNotificationResponseReceivedListener((r) => {
 *     void handleNudgeResponse(r);
 *   });
 * or via registerNudgeResponseListener() below.
 */
export async function handleNudgeResponse(
  response: NotificationResponse,
): Promise<'done' | 'started' | 'snoozed' | 'ignored'> {
  const content = response.notification.request.content;
  const data = (content.data ?? {}) as Record<string, unknown>;
  const parsed = parseNudgeId(response.notification.request.identifier);
  const blockId =
    typeof data.blockId === 'string' ? data.blockId : (parsed?.blockId ?? null);
  const date =
    typeof data.date === 'string' ? data.date : (parsed?.date ?? null);
  if (!blockId || !date) return 'ignored';

  const action = response.actionIdentifier;
  if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) return 'ignored';

  const store = useStore.getState();
  if (action === ACTION_DONE) {
    await store.markDone(blockId, date);
    await cancelAllForBlock(blockId);
    return 'done';
  }
  if (action === ACTION_START) {
    await store.markStarted(blockId, date);
    return 'started';
  }
  if (action === ACTION_SNOOZE) {
    await store.snooze(blockId, date, SNOOZE_MINUTES);
    await reschedule();
    return 'snoozed';
  }
  return 'ignored';
}

/** Subscribe the response handler; returns the subscription (call .remove()). */
export function registerNudgeResponseListener(): ReturnType<
  typeof Notifications.addNotificationResponseReceivedListener
> {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    void handleNudgeResponse(response);
  });
}

/** Fire one test nudge immediately (for Settings / debugging). */
export async function testNudgeNow(title = 'Takt test'): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Takt test nudge',
      body: `${title} — nudges are working. Tap Done to clear this test.`,
      categoryIdentifier: NUDGE_CATEGORY_ID,
      data: { test: true },
    },
    trigger: null,
  });
}
