// Guards for the 2026-11-11 notification diagnostics: when the user
// gets zero notifications, Settings must show WHY (permission, channel,
// what is actually scheduled) instead of silently scheduling nothing.
// A denied permission makes rescheduleIfPermitted return 0 — the plan
// is never built, so no nudge can ever fire.
// eslint-disable-next-line import/no-unresolved
import NUDGE_SRC from '../nudge.ts?raw';
// eslint-disable-next-line import/no-unresolved
import SETTINGS_SRC from '../../app/settings.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('notification diagnostics', () => {
  it('exposes permission, exact alarms, channel and scheduled nudges for Settings', () => {
    expect(NUDGE_SRC).toContain('export async function getNotificationStatus');
    expect(NUDGE_SRC).toContain('permission: perm.status');
    expect(NUDGE_SRC).toContain('getExactAlarmPermissionsAsync');
    expect(NUDGE_SRC).toContain('exactAlarm');
    expect(NUDGE_SRC).toContain('scheduledCount');
    expect(NUDGE_SRC).toContain('nextNudge');
    expect(SETTINGS_SRC).toContain('getNotificationStatus');
    expect(SETTINGS_SRC).toContain('Notifications are off, so no nudge can fire');
    expect(SETTINGS_SRC).toContain('Exact alarms:');
    expect(SETTINGS_SRC).toContain('Without exact alarms, nudges arrive minutes late');
    expect(SETTINGS_SRC).toContain('Allow exact alarms');
    expect(SETTINGS_SRC).toContain('Scheduled nudges:');
    expect(SETTINGS_SRC).toContain('Next nudge:');
    expect(SETTINGS_SRC).toContain('Allow notifications');
  });

  it('a denied permission schedules zero nudges (the silent failure)', () => {
    const start = NUDGE_SRC.indexOf('export async function rescheduleIfPermitted');
    expect(start).toBeGreaterThan(-1);
    const block = NUDGE_SRC.slice(start, start + 300);
    expect(block).toContain("if (perm.status !== 'granted') return 0;");
  });
});
