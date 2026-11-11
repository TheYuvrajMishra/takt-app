// Guards for the 2026-11-11 batch 3:
// (1) onboarding asks for the user's name and shows phone mockups of
//     the app (how/where to create); (2) the test nudge goes through
//     the real nudge channel (alarm sound + actions), and Settings can
//     fire one on demand.
// eslint-disable-next-line import/no-unresolved
import ONBOARDING_SRC from '../../app/onboarding.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import SETTINGS_SRC from '../../app/settings.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import NUDGE_SRC from '../nudge.ts?raw';
// eslint-disable-next-line import/no-unresolved
import TYPES_SRC from '../../types.ts?raw';
import { describe, expect, it } from 'vitest';

describe('onboarding asks for a name', () => {
  it('stores the name in settings and greets with it', () => {
    expect(TYPES_SRC).toContain('userName?: string;');
    expect(ONBOARDING_SRC).toContain('What should Takt call you?');
    expect(ONBOARDING_SRC).toContain('placeholder="Your name"');
    expect(ONBOARDING_SRC).toContain('void updateSettings({ userName: trimmed })');
    expect(ONBOARDING_SRC).toContain('You are all set{name.trim()');
  });
});

describe('onboarding shows app mockups', () => {
  it('renders phone-frame mockups for Today, Calendar and Stats', () => {
    expect(ONBOARDING_SRC).toContain('MockupPhone');
    expect(ONBOARDING_SRC).toContain('caption="Today — create from the dock"');
    expect(ONBOARDING_SRC).toContain('caption="Calendar — plan ahead, drag between days"');
    expect(ONBOARDING_SRC).toContain('caption="Stats — your discipline, as a heatmap"');
    expect(ONBOARDING_SRC).toContain('Hold a category, drag it onto your day');
  });
});

describe('test nudge goes through the real channel', () => {
  it('schedules 1s out on the nudge channel with sound and actions', () => {
    const start = NUDGE_SRC.indexOf('export async function testNudgeNow');
    expect(start).toBeGreaterThan(-1);
    const block = NUDGE_SRC.slice(start);
    expect(block).toContain('SchedulableTriggerInputTypes.DATE');
    expect(block).toContain('channelId: NUDGE_CHANNEL_ID');
    expect(block).toContain('sound: ALARM_SOUND_FILE');
    expect(block).toContain('categoryIdentifier: NUDGE_CATEGORY_ID');
    expect(block).not.toContain('trigger: null,');
  });

  it('onboarding sends the real test nudge, and Settings can too', () => {
    expect(ONBOARDING_SRC).toContain('await testNudgeNow(');
    expect(SETTINGS_SRC).toContain('testNudgeNow');
    expect(SETTINGS_SRC).toContain('Send a test notification');
  });
});
