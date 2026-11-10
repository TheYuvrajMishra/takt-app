// calendar helpers tests: categoryById must resolve user-created
// categories from the live store list, not just the defaults.
import { describe, expect, it } from 'vitest';
import { assignLanes, categoryById, variantForHeight } from '../../components/calendar/helpers';
import { DEFAULT_CATEGORIES, type Block, type Category } from '../../types';

const custom: Category = { id: 'cat-abc123', name: 'Reading', color: 'mint', icon: 'custom' };
const live = [...DEFAULT_CATEGORIES, custom];

describe('categoryById', () => {
  it('resolves a default id from the defaults', () => {
    expect(categoryById('cat-job').name).toBe('Job');
  });

  it('resolves a user-created category from the live list', () => {
    const cat = categoryById('cat-abc123', live);
    expect(cat.name).toBe('Reading');
    expect(cat.color).toBe('mint');
  });

  it('does NOT resolve a custom id from the defaults alone', () => {
    // This is the bug: the old default-only lookup mislabelled custom
    // blocks as "Custom" in apricot.
    expect(categoryById('cat-abc123').name).toBe('Custom');
  });

  it('falls back to Custom for unknown ids', () => {
    expect(categoryById('no-such-id', live).name).toBe('Custom');
  });
});

describe('assignLanes', () => {
  const blk = (id: string, startMin: number, durationMin: number): Block => ({
    id, categoryId: 'cat-job', title: id, startMin, durationMin,
  });

  it('gives non-overlapping blocks full width (lane 0 of 1)', () => {
    const out = assignLanes([blk('a', 540, 30), blk('b', 600, 30)]);
    expect(out.map((o) => [o.lane, o.laneCount])).toEqual([[0, 1], [0, 1]]);
  });

  it('lays two overlapping blocks side by side (lanes 0 and 1 of 2)', () => {
    const out = assignLanes([blk('a', 540, 30), blk('b', 555, 30)]);
    expect(out.map((o) => [o.lane, o.laneCount])).toEqual([[0, 2], [1, 2]]);
  });

  it('reuses a lane once its block ends, keeping laneCount at the true max', () => {
    const out = assignLanes([blk('a', 540, 30), blk('b', 555, 30), blk('c', 570, 30)]);
    expect(out.map((o) => [o.lane, o.laneCount])).toEqual([[0, 2], [1, 2], [0, 2]]);
  });

  it('stacks three mutually overlapping blocks into three lanes', () => {
    const out = assignLanes([blk('a', 540, 60), blk('b', 550, 60), blk('c', 560, 60)]);
    expect(out.map((o) => o.laneCount)).toEqual([3, 3, 3]);
    expect(out.map((o) => o.lane)).toEqual([0, 1, 2]);
  });
});

describe('variantForHeight', () => {
  it('tiny at or under 32dp', () => {
    expect(variantForHeight(28)).toBe('tiny');
    expect(variantForHeight(32)).toBe('tiny');
  });
  it('small up to 52dp, normal up to 96dp, large above', () => {
    expect(variantForHeight(33)).toBe('small');
    expect(variantForHeight(52)).toBe('small');
    expect(variantForHeight(53)).toBe('normal');
    expect(variantForHeight(96)).toBe('normal');
    expect(variantForHeight(97)).toBe('large');
  });
});
