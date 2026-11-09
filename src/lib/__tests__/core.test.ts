// Pure-logic tests for src/lib/core.ts.
import { describe, expect, it } from 'vitest';
import type { Block, CompletionEntry } from '../../types';
import { DEFAULT_SETTINGS } from '../../types';
import {
  blockEnd,
  dateKey,
  defaultDoNotNudgeFor,
  disciplineScore,
  earliestEmptySlot,
  isInQuietHours,
  minToTime,
  nudgeTimes,
  overlaps,
  snap5,
} from '../core';

function block(
  id: string,
  startMin: number,
  durationMin: number,
): Block {
  return { id, categoryId: 'cat-job', title: id, startMin, durationMin };
}

describe('minToTime / dateKey', () => {
  it('formats minutes from midnight', () => {
    expect(minToTime(0)).toBe('00:00');
    expect(minToTime(450)).toBe('07:30');
    expect(minToTime(1439)).toBe('23:59');
  });

  it('keys a date as YYYY-MM-DD in local time', () => {
    expect(dateKey(new Date(2026, 10, 10, 15, 30))).toBe('2026-11-10');
  });
});

describe('disciplineScore', () => {
  it('returns 0 with no blocks', () => {
    expect(disciplineScore([], [])).toBe(0);
  });

  it('weights on-time full, late half, in-progress quarter', () => {
    const blocks = [block('a', 480, 60), block('b', 600, 60), block('c', 720, 60)];
    const log: CompletionEntry[] = [
      { blockId: 'a', date: '2026-11-10', status: 'complete', onTime: true },
      { blockId: 'b', date: '2026-11-10', status: 'complete', onTime: false },
      { blockId: 'c', date: '2026-11-10', status: 'progress' },
    ];
    // (60 + 30 + 15) / 180 = 58.3 -> 58
    expect(disciplineScore(blocks, log)).toBe(58);
  });

  it('ignores missed / skipped / absent entries', () => {
    const blocks = [block('a', 480, 60)];
    const log: CompletionEntry[] = [
      { blockId: 'a', date: '2026-11-10', status: 'missed' },
    ];
    expect(disciplineScore(blocks, log)).toBe(0);
  });

  it('scores 100 when everything is on time', () => {
    const blocks = [block('a', 480, 30), block('b', 540, 30)];
    const log: CompletionEntry[] = [
      { blockId: 'a', date: '2026-11-10', status: 'complete', onTime: true },
      { blockId: 'b', date: '2026-11-10', status: 'complete', onTime: true },
    ];
    expect(disciplineScore(blocks, log)).toBe(100);
  });
});

describe('overlaps / blockEnd', () => {
  it('detects touching blocks as non-overlapping', () => {
    expect(overlaps(block('a', 480, 60), block('b', 540, 60))).toBe(false);
    expect(overlaps(block('a', 480, 60), block('b', 539, 60))).toBe(true);
    expect(blockEnd(block('a', 480, 60))).toBe(540);
  });
});

describe('earliestEmptySlot', () => {
  it('returns fromMin on an empty day, snapped to the 5-min grid', () => {
    expect(earliestEmptySlot([], 482, 25)).toBe(485);
    expect(earliestEmptySlot([], 480, 25)).toBe(480);
  });

  it('jumps past a conflicting block', () => {
    const blocks = [block('a', 480, 60)];
    expect(earliestEmptySlot(blocks, 480, 25)).toBe(540);
    expect(earliestEmptySlot(blocks, 500, 25)).toBe(540);
  });

  it('returns null when nothing fits before midnight', () => {
    expect(earliestEmptySlot([], 1430, 25)).toBe(null);
    expect(earliestEmptySlot([block('a', 0, 1440)], 0, 25)).toBe(null);
  });

  it('finds a gap between blocks', () => {
    const blocks = [block('a', 480, 60), block('b', 600, 60)];
    expect(earliestEmptySlot(blocks, 480, 30)).toBe(540);
  });
});

describe('snap5', () => {
  it('snaps to the nearest 5 minutes', () => {
    expect(snap5(482)).toBe(480);
    expect(snap5(483)).toBe(485);
    expect(snap5(480)).toBe(480);
  });
});

describe('nudgeTimes', () => {
  it('starts at block start and repeats to end + 60 min', () => {
    // 09:00–09:30, every 7 min, cap 12: 540, 547, ... 617 (13 slots to 630, capped)
    const times = nudgeTimes(block('a', 540, 30), 7, 12);
    expect(times[0]).toBe(540);
    expect(times[times.length - 1]).toBe(617);
    expect(times.length).toBe(12);
  });

  it('respects the max-nudges cap', () => {
    const times = nudgeTimes(block('a', 540, 30), 7, 3);
    expect(times).toEqual([540, 547, 554]);
  });

  it('stops at end + 60 even with a high cap', () => {
    const times = nudgeTimes(block('a', 540, 30), 10, 100);
    expect(times).toEqual([540, 550, 560, 570, 580, 590, 600, 610, 620, 630]);
  });
});

describe('isInQuietHours', () => {
  it('handles a daytime range', () => {
    expect(isInQuietHours(600, '09:00', '17:00')).toBe(true);
    expect(isInQuietHours(539, '09:00', '17:00')).toBe(false);
    expect(isInQuietHours(1020, '09:00', '17:00')).toBe(false);
  });

  it('handles an overnight range', () => {
    expect(isInQuietHours(1380, '22:00', '07:00')).toBe(true); // 23:00
    expect(isInQuietHours(360, '22:00', '07:00')).toBe(true); // 06:00
    expect(isInQuietHours(420, '22:00', '07:00')).toBe(false); // 07:00
    expect(isInQuietHours(720, '22:00', '07:00')).toBe(false); // 12:00
  });
});

describe('defaultDoNotNudgeFor', () => {
  it('silences when the global default is on', () => {
    const s = { ...DEFAULT_SETTINGS, defaultDoNotNudge: true };
    expect(defaultDoNotNudgeFor(s, 'cat-job')).toBe(true);
  });

  it('silences when the category is in the default list', () => {
    const s = { ...DEFAULT_SETTINGS, doNotNudgeCategoryIds: ['cat-sleep'] };
    expect(defaultDoNotNudgeFor(s, 'cat-sleep')).toBe(true);
    expect(defaultDoNotNudgeFor(s, 'cat-job')).toBe(false);
  });

  it('nudges when neither default covers the category', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(defaultDoNotNudgeFor(s, 'cat-job')).toBe(false);
  });
});
