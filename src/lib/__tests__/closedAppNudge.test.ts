// Guards for the 2026-11-11 bug fixes:
// (1) a nudge must be scheduled even if the app is closed a second after
//     the task is created — doReschedule schedules the plan BEFORE the
//     slow fetch of all scheduled notifications (the plan is sorted by
//     fire time, so the soonest nudge lands first);
// (2) a block whose time window is active but the user never pressed
//     Start shows "Now", not "In progress" — only an actual Start is
//     progress;
// (3) the "Build your first day" onboarding step is gone (6 steps).
// eslint-disable-next-line import/no-unresolved
import NUDGE_SRC from '../nudge.ts?raw';
// eslint-disable-next-line import/no-unresolved
import INDEX_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import PILL_SRC from '../../components/Pill.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import ONBOARDING_SRC from '../../app/onboarding.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TOKENS_SRC from '../../theme/tokens.ts?raw';
import { describe, expect, it } from 'vitest';

describe('nudge is scheduled before the slow fetch', () => {
  it('schedules the plan first, then fetches and cancels stale ones', () => {
    const start = NUDGE_SRC.indexOf('async function doReschedule');
    expect(start).toBeGreaterThan(-1);
    const block = NUDGE_SRC.slice(start, start + 2600);
    const scheduleIdx = block.indexOf('await Notifications.scheduleNotificationAsync');
    const fetchIdx = block.indexOf('await Notifications.getAllScheduledNotificationsAsync');
    expect(scheduleIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(scheduleIdx);
  });
});

describe('"Now" vs "In progress"', () => {
  it('has a distinct Now status for an active-but-not-started block', () => {
    expect(PILL_SRC).toContain("Exclude<BlockStatus, 'skipped'> | 'now'");
    expect(PILL_SRC).toContain("now: 'Now'");
    expect(TOKENS_SRC).toContain('now: colors.butter');
    const start = INDEX_SRC.indexOf('function statusFor');
    expect(start).toBeGreaterThan(-1);
    const fn = INDEX_SRC.slice(start, start + 600);
    expect(fn).toContain("return 'now'");
    expect(fn).not.toContain("return 'progress';\n  }\n  return 'upcoming';");
  });
});

describe('onboarding has no "Build your first day" step', () => {
  it('is 6 steps with no sandbox', () => {
    expect(ONBOARDING_SRC).toContain('const TOTAL_STEPS = 6;');
    expect(ONBOARDING_SRC).not.toContain('Build your first day');
    expect(ONBOARDING_SRC).not.toContain('miniBlocks');
    expect(ONBOARDING_SRC).not.toContain('RADIAL_CATS');
    expect(ONBOARDING_SRC).not.toContain('dragResponder');
  });
});
