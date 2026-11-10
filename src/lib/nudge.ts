// Takt — nudge engine (expo-notifications SDK 58).
// Schedules a rolling 48h window of nudges from the store's blocks + settings.
// Notification identifiers encode blockId + date + index, so cancellation is exact.
// Copy is escalating but never rude. No emoji anywhere.
import * as Notifications from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import type { Block, CompletionEntry, Settings } from '../types';
import { blockEnd, dateKey, isInQuietHours, nudgeTimes } from './core';
import { setAfterChangeHook, useStore } from '../store/useStore';

export const NUDGE_CHANNEL_ID = 'takt-nudges';
export const NUDGE_CATEGORY_ID = 'takt-block';
/**
 * Alarm sound for nudges (missed blocks + up next). The file lives in
 * assets/sounds/alarm.wav and is bundled into the native project by the
 * expo-notifications plugin (app.json `sounds` — prebuild copies it to
 * res/raw). On Android the channel carries the sound; on iOS each
 * notification carries it in its content. Changing the channel's sound on
 * an existing install needs a delete + recreate (Android ignores sound
 * changes on an existing channel) — ensureChannelAndCategory does that
 * only when the current channel's sound is not already this one, so a
 * user's other channel settings are left alone.
 */
export const ALARM_SOUND_FILE = 'alarm.wav';
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
  /** True when this is a post-end wrap-up nudge for a started block. */
  wrapUp: boolean;
  /** True when this nudge fires at/after the block end (its "starts now"
   * copy would be a lie even when it is the first one scheduled). */
  pastEnd: boolean;
  /** True when earlier slots were dropped (past / quiet hours), so the copy
   * must not claim the block "starts now" even though it is nudge #0. */
  firstSlotSkipped: boolean;
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

/** Wrap-up copy for a block already started: never "starts now" after the end. */
export function wrapUpCopy(title: string): NudgeCopy {
  return {
    title: `${title} — almost there`,
    body: `You started ${title}. Wrap it up when you are ready.`,
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
 * Pure plan for the rolling window: for each date in the next
 * NUDGE_WINDOW_DAYS * 24h (a true rolling window, not just "today +
 * tomorrow as calendar days" — at 23:00 the old day-based loop only
 * covered ~25h), one nudge per core.nudgeTimes slot, skipping
 * done/skipped blocks, doNotNudge blocks, quiet hours, and past times.
 * A started ('progress') block is nudged at reduced intensity: only the
 * wrap-up slots at/after its end fire, so doing the thing is not pestered
 * mid-block — and a started block always keeps at least one wrap-up nudge
 * at its end, even when maxNudgesPerBlock is 1 (whose only slot is the
 * start, which the filter drops). copyIndex counts only the nudges
 * actually scheduled for that block-date, so quiet-hour skips do not make
 * the escalation copy jump ("nudge 1" then "nudge 3"); totalForBlock is
 * the scheduled count, not the raw slot count. The identifier keeps the
 * original slot index so a scheduled notification stays addressable
 * across reschedules.
 * Enforces the per-day cap (earliest first) and the spec ceiling of 12
 * nudges per block even if a restored setting says more.
 */
export function buildNudgePlan(input: BuildNudgePlanInput): NudgePlanItem[] {
  const { blocksByDate, completions, settings, now } = input;
  const doneOrSkipped = new Set(
    completions
      .filter((c) => c.status === 'complete' || c.status === 'skipped')
      .map((c) => `${c.date}:${c.blockId}`),
  );
  const started = new Set(
    completions
      .filter((c) => c.status === 'progress')
      .map((c) => `${c.date}:${c.blockId}`),
  );
  const items: NudgePlanItem[] = [];
  const windowEnd = new Date(now.getTime() + NUDGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // One extra calendar day: a 48h window starting late in the day reaches
  // into the day after tomorrow; the windowEnd filter below cuts it back.
  const maxNudges = Math.min(settings.maxNudgesPerBlock, 12);
  // Validate the plan inputs: a corrupt restore (or hand-edited backup)
  // could otherwise zero-out nudges (perDayNudgeCap 0) or burst them
  // (nudgeIntervalMin 0 schedules maxNudges copies at one instant).
  // Only degenerate values are corrected here — the 5–10 min UI range is
  // enforced in Settings; tests and restored values may use wider ones.
  const intervalMin =
    Number.isFinite(settings.nudgeIntervalMin) && settings.nudgeIntervalMin > 0
      ? Math.min(120, settings.nudgeIntervalMin)
      : 7;
  const perDayCap =
    Number.isFinite(settings.perDayNudgeCap) && settings.perDayNudgeCap > 0
      ? settings.perDayNudgeCap
      : 40;

  for (let dayOffset = 0; dayOffset <= NUDGE_WINDOW_DAYS; dayOffset++) {
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
      const isStarted = started.has(`${date}:${block.id}`);
      const endMin = blockEnd(block);
      const times = nudgeTimes(block, intervalMin, maxNudges);
      const blockItems: NudgePlanItem[] = [];
      let scheduledIdx = 0;
      for (let i = 0; i < times.length; i++) {
        const fireMin = times[i];
        // Started: only wrap-up nudges from the block end onwards.
        if (isStarted && fireMin < endMin) continue;
        // Slots can pass midnight (block ending after 23:00 + 60 min tail):
        // quiet hours are time-of-day, so check the within-day minute...
        const dayMin = fireMin % (24 * 60);
        if (isInQuietHours(dayMin, settings.quietHoursStart, settings.quietHoursEnd)) {
          continue;
        }
        // ...and date the nudge on the day it actually fires, not the
        // block's date — otherwise a foreground reschedule after midnight
        // cancels the still-pending 00:00–01:00 wrap-up as stale.
        const fireDay = new Date(day);
        let slotMin = fireMin;
        if (slotMin >= 24 * 60) {
          fireDay.setDate(fireDay.getDate() + 1);
          slotMin -= 24 * 60;
        }
        const fireAt = new Date(fireDay);
        fireAt.setHours(Math.floor(slotMin / 60), slotMin % 60, 0, 0);
        const fireDate = dateKey(fireDay);
        if (fireAt.getTime() <= now.getTime()) continue;
        if (fireAt.getTime() > windowEnd.getTime()) continue;
        blockItems.push({
          identifier: makeNudgeId(block.id, fireDate, i),
          blockId: block.id,
          date: fireDate,
          title: block.title,
          fireAt,
          copyIndex: scheduledIdx,
          totalForBlock: 0, // filled in below, once the count is known
          wrapUp: isStarted,
          pastEnd: fireMin >= endMin,
          firstSlotSkipped: scheduledIdx === 0 && i > 0,
        });
        scheduledIdx++;
      }
      // Started blocks always keep one wrap-up nudge at the block end,
      // even when every slot was filtered out (e.g. maxNudgesPerBlock 1).
      if (isStarted && blockItems.length === 0) {
        const endDay = new Date(day);
        let endSlot = endMin;
        if (endSlot >= 24 * 60) {
          endDay.setDate(endDay.getDate() + 1);
          endSlot -= 24 * 60;
        }
        const endAt = new Date(endDay);
        endAt.setHours(Math.floor(endSlot / 60), endSlot % 60, 0, 0);
        if (
          endAt.getTime() > now.getTime() &&
          endAt.getTime() <= windowEnd.getTime() &&
          !isInQuietHours(endSlot, settings.quietHoursStart, settings.quietHoursEnd)
        ) {
          blockItems.push({
            identifier: makeNudgeId(block.id, dateKey(endDay), times.length),
            blockId: block.id,
            date: dateKey(endDay),
            title: block.title,
            fireAt: endAt,
            copyIndex: 0,
            totalForBlock: 1,
            wrapUp: true,
            pastEnd: true,
            firstSlotSkipped: false,
          });
        }
      }
      for (const item of blockItems) item.totalForBlock = blockItems.length;
      dayItems.push(...blockItems);
    }
    dayItems.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    items.push(...dayItems.slice(0, perDayCap));
  }

  items.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return items;
}

// ---------------------------------------------------------------------------
// Native setup
// ---------------------------------------------------------------------------
// NOTE: the notification handler itself has exactly one owner — the root
// layout (_layout.tsx), which sets it at module load with sound on. This
// module must not set it again: three writers (layout, here, onboarding)
// used to disagree on shouldPlaySound, and visiting onboarding silently
// re-muted nudges.

async function ensureChannelAndCategory(): Promise<void> {
  // Android only; on iOS this is a no-op that resolves null — hence try/catch.
  try {
    // A channel's sound cannot be changed in place on Android: if this
    // install still has the old channel (default sound), delete + recreate
    // it with the alarm sound. Only the 'default' case migrates — a channel
    // that already has a custom sound is ours (leave it), and a null sound
    // means the user silenced the channel (respect that, don't un-mute it).
    const existing = await Notifications.getNotificationChannelAsync(NUDGE_CHANNEL_ID).catch(
      () => null,
    );
    if (existing && existing.sound === 'default') {
      await Notifications.deleteNotificationChannelAsync(NUDGE_CHANNEL_ID).catch(() => {
        // The channel may already be gone; creating it below still works.
      });
    }
    await Notifications.setNotificationChannelAsync(NUDGE_CHANNEL_ID, {
      name: 'Takt nudges',
      description: 'Reminders to start your scheduled blocks.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: ALARM_SOUND_FILE,
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
  ]).catch(() => {
    // iOS has no categories, and a failure here must not abort init.
  });
}

export async function requestNudgePermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  // Denied once already: do not re-prompt on every cold start. The user can
  // re-enable from onboarding or Settings, which ask again directly.
  if (current.status !== 'undetermined') return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.status === 'granted';
}

/**
 * One-time setup for the app root: channel + category, then wire store
 * changes to reschedule() and schedule the first window.
 * Safe to call repeatedly; returns whether notifications are granted.
 * (The notification handler itself is owned by the root layout, not here.)
 * The permission check is check-only: the cold-start prompt used to fire
 * before onboarding had a chance to explain why notifications matter.
 * Onboarding step 2 does the asking (via requestNudgePermissions);
 * this just schedules when already granted.
 */
export async function initNudges(): Promise<boolean> {
  // Register the hook FIRST: if channel/category setup throws below, store
  // mutations must still rebuild the window instead of freezing the engine.
  setAfterChangeHook(() => {
    // Permission-guarded and failure-logged: after a denial, every store
    // mutation used to fire a bare reschedule() and produce an unhandled
    // rejected promise each time.
    void rescheduleIfPermitted().catch((e) => {
      console.warn('Takt reschedule failed', e);
    });
  });
  await ensureChannelAndCategory();
  const perm = await Notifications.getPermissionsAsync();
  const granted = perm.status === 'granted';
  if (granted) await reschedule();
  return granted;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function planFromStore(now: Date): NudgePlanItem[] {
  const state = useStore.getState();
  const blocksByDate: Record<string, Block[]> = {};
  // Same span as buildNudgePlan: today through the day after tomorrow,
  // so the true 48h window is covered (see the windowEnd filter there).
  for (let dayOffset = 0; dayOffset <= NUDGE_WINDOW_DAYS; dayOffset++) {
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

/** Pick the copy for a planned nudge: wrap-ups never say "starts now", a
 * first nudge firing after the block ended gets the firmer "gentle push"
 * copy instead of "still time to start", and a first nudge whose earlier
 * slots were dropped (past / quiet hours) must not claim the block
 * "starts now" hours after it started. */
export function copyForPlanItem(item: NudgePlanItem): NudgeCopy {
  if (item.wrapUp) return wrapUpCopy(item.title);
  if (item.copyIndex === 0 && item.pastEnd) {
    return nudgeCopy(item.title, 2);
  }
  if (item.copyIndex === 0 && item.firstSlotSkipped) {
    return nudgeCopy(item.title, 1);
  }
  return nudgeCopy(item.title, item.copyIndex);
}

// Serialize reschedules behind a single promise chain: store mutations,
// notification actions and foreground events can all trigger one at once,
// and overlapping cancel-then-schedule loops widen the window where a
// crash leaves the device with no nudges at all.
let rescheduleChain: Promise<number> = Promise.resolve(0);

/**
 * Rebuild the rolling 48h window. Serialized: concurrent callers queue
 * behind the in-flight rebuild instead of interleaving.
 * Returns how many notifications were scheduled.
 */
export function reschedule(): Promise<number> {
  const run = rescheduleChain.then(() => doReschedule());
  // Keep the chain alive after a failure; the caller still sees the error.
  rescheduleChain = run.catch(() => 0);
  return run;
}

/**
 * Schedule-first rebuild: schedule the fresh plan (an identifier that is
 * already scheduled is replaced in place), then cancel only the
 * identifiers the plan no longer wants. The old cancel-all-first order
 * left the device with zero nudges if the process died mid-loop.
 * A failure mid-loop still leaves the previous window largely intact,
 * and the next mutation / foreground event retries.
 */
async function doReschedule(): Promise<number> {
  const plan = planFromStore(new Date());
  const plannedIds = new Set(plan.map((p) => p.identifier));
  const previouslyScheduled =
    await Notifications.getAllScheduledNotificationsAsync();
  for (const item of plan) {
    const copy = copyForPlanItem(item);
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: {
        title: copy.title,
        body: copy.body,
        // The alarm sound: the channel carries it on Android, but iOS
        // takes the sound per notification, so set it here too.
        sound: ALARM_SOUND_FILE,
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
  for (const n of previouslyScheduled) {
    if (n.identifier.startsWith('takt-') && !plannedIds.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  return plan.length;
}

/**
 * Rebuild the rolling 48h window, but only when notifications are granted.
 * Used for opportunistic reschedules (e.g. app returning to the foreground),
 * where an ungranted permission must stay silent instead of attempting to
 * schedule. Returns how many notifications were scheduled (0 if ungranted).
 */
export async function rescheduleIfPermitted(): Promise<number> {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return 0;
  return reschedule();
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
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith('takt-')) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ---------------------------------------------------------------------------
// Responses (Done / Start / Snooze 10) — the app root wires this in.
// ---------------------------------------------------------------------------

export type NudgeResponseResult =
  | 'done'
  | 'started'
  | 'snoozed'
  | 'ignored'
  | 'opened';

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
): Promise<NudgeResponseResult> {
  const content = response.notification.request.content;
  const data = (content.data ?? {}) as Record<string, unknown>;
  const parsed = parseNudgeId(response.notification.request.identifier);
  const blockId =
    typeof data.blockId === 'string' ? data.blockId : (parsed?.blockId ?? null);
  const date =
    typeof data.date === 'string' ? data.date : (parsed?.date ?? null);

  const action = response.actionIdentifier;
  // Tapping the notification body opens the app on Today (the caller
  // navigates on 'opened'). This comes first so even a test nudge with no
  // block data opens the app; action buttons still need a block below.
  if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) return 'opened';
  if (!blockId || !date) return 'ignored';

  const store = useStore.getState();
  if (action === ACTION_DONE) {
    await store.markDone(blockId, date);
    // Cancel ONLY this block-date: cancelling every date for the block id
    // would also kill tomorrow's nudges for the same recurring block.
    // The explicit reschedule() below then rebuilds the window
    // deterministically (the done block-date is excluded by the plan).
    await cancelNudgesForBlockOnDate(blockId, date);
    await reschedule();
    return 'done';
  }
  if (action === ACTION_START) {
    await store.markStarted(blockId, date);
    // Started reduces nudge intensity (only wrap-up nudges remain), so the
    // window must be rebuilt now, not left to the fire-and-forget hook.
    await reschedule();
    return 'started';
  }
  if (action === ACTION_SNOOZE) {
    await store.snooze(blockId, date, SNOOZE_MINUTES);
    await reschedule();
    return 'snoozed';
  }
  return 'ignored';
}

/**
 * Subscribe the response handler; `onResult` fires for every handled
 * response (e.g. the root layout navigates to Today on 'opened').
 * Returns the subscription (call .remove()).
 */
export function registerNudgeResponseListener(
  onResult?: (result: NudgeResponseResult) => void,
): ReturnType<typeof Notifications.addNotificationResponseReceivedListener> {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    void handleNudgeResponse(response).then((result) => onResult?.(result));
  });
}

/** Fire one test nudge immediately (for Settings / debugging). */
export async function testNudgeNow(title = 'Takt test'): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Takt test nudge',
      body: `${title} — nudges are working. Tap the notification to open Takt.`,
      sound: ALARM_SOUND_FILE,
      categoryIdentifier: NUDGE_CATEGORY_ID,
      data: { test: true },
    },
    trigger: null,
  });
}
