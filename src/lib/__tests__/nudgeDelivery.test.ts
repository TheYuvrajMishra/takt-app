// Guards the 2026-11-12 batching bug: every nudge for a 10:00 task
// arrived in one batch at ~10:45 instead of every 7 min from 10:00.
// 'bestEffort' (setExactAndAllowWhileIdle, the default) is deferred by
// minutes on some OEM builds (HyperOS); 'alarmClock' (setAlarmClock) is
// NOT deferred for battery optimization, so nudges must use it.
// eslint-disable-next-line import/no-unresolved
import NUDGE_SRC from '../nudge.ts?raw';
import { describe, expect, it } from 'vitest';

describe('nudge delivery is alarmClock, not bestEffort', () => {
  it('schedules the plan with alarmClock delivery', () => {
    const start = NUDGE_SRC.indexOf('async function doReschedule');
    expect(start).toBeGreaterThan(-1);
    const block = NUDGE_SRC.slice(start, start + 2200);
    expect(block).toContain("delivery: 'alarmClock'");
    // The test nudge must use the same delivery or it proves nothing.
    const testIdx = NUDGE_SRC.indexOf('export async function testNudgeNow');
    expect(testIdx).toBeGreaterThan(-1);
    const testBlock = NUDGE_SRC.slice(testIdx, testIdx + 900);
    expect(testBlock).toContain("delivery: 'alarmClock'");
  });
});
