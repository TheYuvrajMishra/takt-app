// Calendar helpers (Worker C). Pure helpers for the calendar grid.
// Blocks come from the zustand store (src/store/useStore.ts) — this file
// holds no sample data anymore.
import { DEFAULT_CATEGORIES, type Block, type Category } from '../../types';
import type { CategoryColorName } from '../../theme/tokens';
import { minToTime, snap5 } from '../../lib/core';

export { minToTime };

export function newId(): string {
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setDate(c.getDate() - c.getDay());
  c.setHours(0, 0, 0, 0);
  return c;
}

export function categoryById(id: string): Category {
  return DEFAULT_CATEGORIES.find((c) => c.id === id) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}

/** Text colour that stays legible on a category fill. */
export function textColorFor(color: CategoryColorName): string {
  return color === 'violet' || color === 'orchid' || color === 'carbon' ? '#FFFFFF' : '#0A0A0A';
}

export function formatRange(b: Block): string {
  return `${minToTime(b.startMin)} – ${minToTime(b.startMin + b.durationMin)}`;
}

/**
 * Auto-shift: push every block that overlaps `moved` (or the chain it
 * pushes) down to the first free 5-min slot after it, in start order.
 * Returns the merged sorted list, or null when a block would run past
 * midnight — the caller then offers Swap instead.
 */
export function autoShiftBlocks(blocks: Block[], moved: Block): Block[] | null {
  const clamped: Block = {
    ...moved,
    startMin: Math.max(0, Math.min(24 * 60 - moved.durationMin, snap5(moved.startMin))),
  };
  const others = blocks
    .filter((b) => b.id !== moved.id)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.startMin - b.startMin);
  let cursor = clamped.startMin + clamped.durationMin;
  for (const b of others) {
    const end = b.startMin + b.durationMin;
    if (b.startMin < cursor && end > clamped.startMin) {
      const nextStart = snap5(cursor);
      if (nextStart + b.durationMin > 24 * 60) return null;
      b.startMin = nextStart;
      cursor = nextStart + b.durationMin;
    }
  }
  return [clamped, ...others].sort((a, b) => a.startMin - b.startMin);
}

export interface RoutineTemplateDef {
  id: string;
  name: string;
  blurb: string;
  kind: 'Weekday' | 'Weekend';
  blocks: Array<{ categoryId: string; title: string; startMin: number; durationMin: number }>;
}

export const ROUTINE_TEMPLATES: RoutineTemplateDef[] = [
  {
    id: 'tpl-weekday-focus',
    name: 'Weekday focus',
    blurb: 'Deep work, learning, workout, journaling.',
    kind: 'Weekday',
    blocks: [
      { categoryId: 'cat-job', title: 'Deep work', startMin: 9 * 60, durationMin: 120 },
      { categoryId: 'cat-learning', title: 'Learning', startMin: 13 * 60, durationMin: 45 },
      { categoryId: 'cat-workout', title: 'Workout', startMin: 18 * 60, durationMin: 45 },
      { categoryId: 'cat-journaling', title: 'Journaling', startMin: 21 * 60 + 30, durationMin: 25 },
    ],
  },
  {
    id: 'tpl-weekend-reset',
    name: 'Weekend reset',
    blurb: 'Slow morning, project time, play.',
    kind: 'Weekend',
    blocks: [
      { categoryId: 'cat-workout', title: 'Morning workout', startMin: 8 * 60, durationMin: 60 },
      { categoryId: 'cat-food', title: 'Brunch', startMin: 10 * 60, durationMin: 45 },
      { categoryId: 'cat-project', title: 'Project time', startMin: 11 * 60, durationMin: 120 },
      { categoryId: 'cat-gaming', title: 'Gaming', startMin: 16 * 60, durationMin: 60 },
      { categoryId: 'cat-journaling', title: 'Journaling', startMin: 21 * 60, durationMin: 30 },
    ],
  },
  {
    id: 'tpl-early-riser',
    name: 'Early riser',
    blurb: 'Train, study, then a long work block.',
    kind: 'Weekday',
    blocks: [
      { categoryId: 'cat-workout', title: 'Early workout', startMin: 5 * 60 + 30, durationMin: 45 },
      { categoryId: 'cat-study', title: 'Study', startMin: 6 * 60 + 30, durationMin: 90 },
      { categoryId: 'cat-job', title: 'Work block', startMin: 9 * 60, durationMin: 180 },
      { categoryId: 'cat-learning', title: 'Evening learning', startMin: 20 * 60, durationMin: 30 },
    ],
  },
];
