// Layout contract guard (Fix 3). The navbar is an absolute overlay and the
// dock floats above it, so content must clear them through ONE contract:
// LayoutProvider + useBottomInset() + the <Screen>/<ScrollScreen>/<ListScreen>
// wrappers. This test reads the sources (via Vite ?raw imports, so no
// node:fs types are needed) and fails if a screen goes back to a raw
// ScrollView/FlatList with a hand-written bottom, a raw Modal drawer, or a
// hard-coded bottom offset.
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import LAYOUT_SRC from '../../components/layout.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TODAY_SRC from '../../app/(tabs)/index.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import CALENDAR_SRC from '../../app/(tabs)/calendar.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import STATS_SRC from '../../app/(tabs)/stats.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import SETTINGS_SRC from '../../app/settings.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import ONBOARDING_SRC from '../../app/onboarding.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import SHEET_SRC from '../../components/Sheet.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import END_OF_DAY_SRC from '../../components/EndOfDaySheet.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import DOCK_SRC from '../../components/Dock.tsx?raw';

const SCREENS: Array<[string, string]> = [
  ['Today', TODAY_SRC],
  ['Calendar', CALENDAR_SRC],
  ['Stats', STATS_SRC],
  ['Settings', SETTINGS_SRC],
  ['Onboarding', ONBOARDING_SRC],
];

describe('layout contract', () => {
  it('exposes the contract API', () => {
    for (const name of [
      'LayoutProvider',
      'useBottomInset',
      'useDockBottom',
      'Screen',
      'ScrollScreen',
      'ListScreen',
      'LAYOUT_GAP',
    ]) {
      expect(LAYOUT_SRC).toContain(name);
    }
  });

  it('every screen uses the wrapper from components/layout', () => {
    for (const [name, src] of SCREENS) {
      expect(src, `${name} must import from components/layout`).toContain(
        'components/layout',
      );
      expect(src, `${name} must use Screen or ScrollScreen`).toMatch(
        /<Screen|<ScrollScreen/,
      );
    }
  });

  it('no screen uses a raw vertical ScrollView/FlatList/SectionList', () => {
    // Nested horizontal scrollers (chip rows, timeline strips) are fine;
    // a screen-level vertical scroll must go through ScrollScreen.
    for (const [name, src] of SCREENS) {
      const tags = [...src.matchAll(/<(ScrollView|FlatList|SectionList)([\s>][\s\S]{0,300}?)>/g)];
      for (const tag of tags) {
        const opening = tag[0];
        expect(opening, `${name}: raw ${tag[1]} must be horizontal`).toContain(
          'horizontal',
        );
      }
    }
  });

  it('no drawer uses a raw Modal outside the shared Sheet', () => {
    for (const [name, src] of [
      ...SCREENS,
      ['EndOfDaySheet', END_OF_DAY_SRC],
      ['Dock', DOCK_SRC],
    ]) {
      expect(src, `${name} must not render a raw <Modal`).not.toContain('<Modal');
    }
    expect(SHEET_SRC).toContain('<Modal');
  });

  it('no screen hard-codes bottom chrome offsets', () => {
    const forbidden = [
      'bottom: 84',
      'bottom: 120',
      'paddingBottom: 110',
      'paddingBottom: 210',
      'marginBottom: 84',
    ];
    for (const [name, src] of SCREENS) {
      for (const f of forbidden) {
        expect(src, `${name} must not contain "${f}"`).not.toContain(f);
      }
    }
  });

  it('the dock positions itself from the layout context, never hard-coded', () => {
    expect(DOCK_SRC).toContain('useDockBottom');
    expect(DOCK_SRC).toContain('useDockHeightReporter');
    expect(DOCK_SRC).toContain('bottom: dockBottom');
  });
});
