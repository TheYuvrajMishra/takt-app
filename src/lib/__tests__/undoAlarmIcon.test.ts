// Guards for the 2026-11-11 batch 2 (all written on the current code):
// (1) a mistaken Done is undoable — toast Undo right after marking Done,
//     plus "Mark as not done" in the block sheet; (2) the nudge alarm is
//     long and continuous-feeling, and Start / Done on the notification
//     stop the nudging; (3) the notification carries a proper icon.
// eslint-disable-next-line import/no-unresolved
import INDEX_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import STORE_SRC from '../../store/useStore.ts?raw';
// eslint-disable-next-line import/no-unresolved
import NUDGE_SRC from '../nudge.ts?raw';
// eslint-disable-next-line import/no-unresolved
import ALARM_SCRIPT_SRC from '../../../scripts/gen-alarm-sound.mjs?raw';
// eslint-disable-next-line import/no-unresolved
import APP_JSON_SRC from '../../../app.json?raw';
import { describe, expect, it } from 'vitest';

describe('undo a mistaken Done', () => {
  it('the store can clear a completion (markNotDone)', () => {
    expect(STORE_SRC).toContain('markNotDone: (blockId: string, date: string) => Promise<void>;');
    expect(STORE_SRC).toContain('markNotDone: async (blockId, date) => {');
    expect(STORE_SRC).toContain('db.deleteCompletion(blockId, date)');
    expect(STORE_SRC).toContain("emitToast('Marked as not done.');");
  });

  it('the Done toast carries an Undo button', () => {
    expect(INDEX_SRC).toContain("toastMsg === 'Done. Nice work.'");
    expect(INDEX_SRC).toContain('>Undo</Text>');
    expect(INDEX_SRC).toContain('void undo();');
  });

  it('the block sheet offers "Mark as not done" for a done block', () => {
    expect(INDEX_SRC).toContain("label={sheetStatus === 'complete' ? 'Mark as not done' : 'Mark done'}");
    expect(INDEX_SRC).toContain('void markNotDone(sheetBlock.id, today);');
  });
});

describe('continuous alarm: Start / Done on the notification stop the nudge', () => {
  it('the alarm sound is long (repeating beeps), not one short blip', () => {
    expect(ALARM_SCRIPT_SRC).toContain('const CYCLE = [');
    expect(ALARM_SCRIPT_SRC).toContain('const REPEATS = 15;');
    expect(ALARM_SCRIPT_SRC).toContain('[...Array(REPEATS).fill(CYCLE).flat(), [880, 0.45]]');
  });

  it('the nudge notification carries Start and Done actions', () => {
    expect(NUDGE_SRC).toContain("ACTION_DONE = 'done'");
    expect(NUDGE_SRC).toContain("ACTION_START = 'start'");
    expect(NUDGE_SRC).toContain("{ identifier: ACTION_DONE, buttonTitle: 'Done' }");
    expect(NUDGE_SRC).toContain("{ identifier: ACTION_START, buttonTitle: 'Start' }");
    expect(NUDGE_SRC).toContain('categoryIdentifier: NUDGE_CATEGORY_ID');
  });

  it('Start stops the start-nudge, Done cancels the block nudges', () => {
    expect(NUDGE_SRC).toContain('if (action === ACTION_DONE) {');
    expect(NUDGE_SRC).toContain('await store.markDone(blockId, date);');
    expect(NUDGE_SRC).toContain('await cancelNudgesForBlockOnDate(blockId, date);');
    expect(NUDGE_SRC).toContain('if (action === ACTION_START) {');
    expect(NUDGE_SRC).toContain('await store.markStarted(blockId, date);');
  });
});

describe('notification icon', () => {
  it('the notification uses a monochrome icon, not the full-colour app icon', () => {
    // Plugins are ["expo-notifications", { color, icon, sounds }] pairs.
    const app = JSON.parse(APP_JSON_SRC) as {
      expo: { plugins: Array<string | [string, Record<string, unknown>]> };
    };
    const notifEntry = app.expo.plugins.find(
      (p): p is [string, { icon?: string }] =>
        Array.isArray(p) && p[0] === 'expo-notifications',
    );
    expect(notifEntry?.[1]?.icon).toBe('./assets/notification-icon.png');
    // (The app's own top-level icon stays ./assets/icon.png — only the
    // notification's small icon is the monochrome one.)
  });
});
