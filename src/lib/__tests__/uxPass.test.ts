// Guards for the 2026-11-11 UX pass (20 concepts, applied where they
// are concrete and safe in this app):
// tabular numbers, optimistic Done, 44dp touch targets, tracking,
// legibility of the smallest labels, staggered onboarding rows, and
// title autocomplete (combobox) in the quick-create sheet.
// eslint-disable-next-line import/no-unresolved
import INDEX_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CAL_SRC from '../../app/(tabs)/calendar.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TIMELINE_SRC from '../../components/MiniTimeline.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import ONBOARDING_SRC from '../../app/onboarding.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TOKENS_SRC from '../../theme/tokens.ts?raw';
// eslint-disable-next-line import/no-unresolved
import STORE_SRC from '../../store/useStore.ts?raw';
// eslint-disable-next-line import/no-unresolved
import BLOCKCARD_SRC from '../../components/calendar/BlockCard.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('tabular numbers stop digit jitter', () => {
  it('uses tabular-nums on every time/number readout', () => {
    expect(INDEX_SRC).toContain("fontVariant: ['tabular-nums']");
    expect(TIMELINE_SRC).toContain("fontVariant: ['tabular-nums']");
    expect(CAL_SRC).toContain("fontVariant: ['tabular-nums']");
    expect(BLOCKCARD_SRC).toContain("fontVariant: ['tabular-nums']");
  });
});

describe('optimistic Done', () => {
  it('sets state before the sqlite write, and reverts on failure', () => {
    const start = STORE_SRC.indexOf('async function commitCompletion');
    expect(start).toBeGreaterThan(-1);
    const block = STORE_SRC.slice(start, start + 1800);
    const setIdx = block.indexOf('set((s) => ({');
    const awaitIdx = block.indexOf('await db.saveCompletion(entry)');
    expect(setIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeGreaterThan(setIdx);
    expect(block).toContain('catch (e)');
    expect(block).toContain('const prev = get().completions.find(');
  });
});

describe('44dp touch targets', () => {
  it('gives the drawer pills and quick-create chips a 44dp minimum', () => {
    expect(DOCK_SRC).toContain('minHeight: 44,');
    expect(CAL_SRC).toContain('minHeight: 44,');
  });
});

describe('tracking scale', () => {
  it('defines tight/wide tracking and uses it on display + label type', () => {
    expect(TOKENS_SRC).toContain('tight: -0.5');
    expect(TOKENS_SRC).toContain('wide: 3');
    expect(ONBOARDING_SRC).toContain('letterSpacing: tracking.tight');
    expect(INDEX_SRC).toContain('letterSpacing: tracking.tight');
    expect(INDEX_SRC).toContain('letterSpacing: tracking.wide');
  });
});

describe('smallest labels stay legible', () => {
  it('has no 10px text left', () => {
    for (const src of [CAL_SRC, ONBOARDING_SRC]) {
      expect(src).not.toContain('fontSize: 10');
    }
  });
});

describe('staggered onboarding rows', () => {
  it('staggers the category rows as they enter', () => {
    expect(ONBOARDING_SRC).toContain('FadeInUp.delay(idx * 40)');
  });
});

describe('title autocomplete (combobox)', () => {
  it('suggests past titles as you type, and tapping one fills the input', () => {
    expect(STORE_SRC).toContain('getPastTitles: () => string[];');
    expect(STORE_SRC).toContain('getPastTitles: () => {');
    expect(CAL_SRC).toContain('titleSuggestions');
    expect(CAL_SRC).toContain('onPress={() => setQcTitle(t)}');
  });
});
