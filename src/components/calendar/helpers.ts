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

/**
 * Resolve a category by id. Pass the store's live categories so
 * user-created categories resolve with their real name/colour/icon —
 * DEFAULT_CATEGORIES alone can never match a db-generated custom id
 * (see store addCategory), and the old default-only lookup mislabelled
 * custom blocks as "Custom" in apricot on the calendar. Falls back to
 * the last default (Custom) for unknown ids.
 */
export function categoryById(id: string, categories: Category[] = DEFAULT_CATEGORIES): Category {
  return categories.find((c) => c.id === id) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}

/** Text colour that stays legible on a category fill. */
export function textColorFor(color: CategoryColorName): string {
  return color === 'violet' || color === 'orchid' || color === 'carbon' ? '#FFFFFF' : '#0A0A0A';
}

export function formatRange(b: Block): string {
  return `${minToTime(b.startMin)} – ${minToTime(b.startMin + b.durationMin)}`;
}

export type BlockVariant = 'tiny' | 'small' | 'normal' | 'large';

/**
 * Adaptive block variant by rendered height — pure. A block is never
 * empty: tiny (<=32dp) shows "Title - 9:00" on one line, small adds the
 * time on the same line, normal shows title + time range + category,
 * large adds notes preview + subcategory.
 */
export function variantForHeight(height: number): BlockVariant {
  if (height <= 32) return 'tiny';
  if (height <= 52) return 'small';
  if (height <= 96) return 'normal';
  return 'large';
}

/**
 * Side-by-side lanes for overlapping blocks (Google Calendar style), so a
 * tiny block never hides under a neighbour. Interval partitioning: each
 * block takes the first lane whose last block already ended. Blocks that
 * do not overlap anything keep lane 0 of 1 (full width).
 */
export interface LaneAssignment {
  block: Block;
  lane: number;
  laneCount: number;
}

export function assignLanes(blocks: Block[]): LaneAssignment[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const laneEnds: number[] = [];
  const out: LaneAssignment[] = [];
  for (const b of sorted) {
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.startMin + b.durationMin);
    } else {
      laneEnds[lane] = b.startMin + b.durationMin;
    }
    out.push({ block: b, lane, laneCount: 0 });
  }
  // laneCount = max lanes used by any block overlapping this one.
  const maxLanes = laneEnds.length;
  for (const o of out) {
    let count = 1;
    for (const other of out) {
      if (other === o) continue;
      const overlap =
        other.block.startMin < o.block.startMin + o.block.durationMin &&
        o.block.startMin < other.block.startMin + other.block.durationMin;
      if (overlap) count = Math.max(count, other.lane + 1);
    }
    o.laneCount = Math.max(o.lane + 1, count, 1);
    if (o.laneCount > maxLanes) o.laneCount = maxLanes;
  }
  return out;
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
