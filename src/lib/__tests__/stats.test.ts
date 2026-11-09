// Stats helper tests: heatmap pattern geometry (pure).
import { describe, expect, it } from 'vitest';
import { heatmapPatternSegments } from '../stats';

describe('heatmapPatternSegments', () => {
  it('returns no segments at spacing 0', () => {
    expect(heatmapPatternSegments('diag', 0)).toEqual({ lines: [], dots: [] });
  });

  it('diag and diag-rev slope opposite ways', () => {
    const diag = heatmapPatternSegments('diag', 10);
    const rev = heatmapPatternSegments('diag-rev', 10);
    expect(diag.lines.length).toBeGreaterThan(0);
    expect(diag.lines[0][1]).toBe(32); // starts at the bottom edge
    expect(rev.lines[0][1]).toBe(0); // starts at the top edge
    expect(diag.dots).toEqual([]);
    expect(rev.dots).toEqual([]);
  });

  it('cross draws both diagonals', () => {
    const cross = heatmapPatternSegments('cross', 10);
    const diag = heatmapPatternSegments('diag', 10);
    expect(cross.lines.length).toBe(diag.lines.length * 2);
  });

  it('dots draws only dots; horiz/vert draw only lines', () => {
    const dots = heatmapPatternSegments('dots', 10);
    expect(dots.lines).toEqual([]);
    expect(dots.dots.length).toBeGreaterThan(0);
    expect(heatmapPatternSegments('horiz', 10).dots).toEqual([]);
    expect(heatmapPatternSegments('vert', 10).dots).toEqual([]);
  });

  it('every pattern produces segments at level spacing', () => {
    for (const p of ['diag', 'diag-rev', 'horiz', 'vert', 'dots', 'cross'] as const) {
      const { lines, dots } = heatmapPatternSegments(p, 7);
      expect(lines.length + dots.length).toBeGreaterThan(0);
    }
  });
});
