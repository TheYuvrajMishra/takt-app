// calendar helpers tests: categoryById must resolve user-created
// categories from the live store list, not just the defaults.
import { describe, expect, it } from 'vitest';
import { categoryById } from '../../components/calendar/helpers';
import { DEFAULT_CATEGORIES, type Category } from '../../types';

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
