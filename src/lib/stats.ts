import { dateKey } from './core';
import type { Block, BlockStatus, CompletionEntry } from '../types';
import type { PatternKind } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Takt stats helpers — pure functions over day records.
// Screens are wired to the store via `daysFromStore(getBlocksForDate,
// completions)` — see stats.tsx. `sampleDataset()` is kept only as a
// deterministic fixture for tests / previews; no screen uses it.
// ---------------------------------------------------------------------------

export interface SampleBlock {
  categoryId: string;
  title: string;
  durationMin: number;
  status: BlockStatus;
  onTime: boolean;
  nudgesFired: number;
}

export interface DayRecord {
  date: string; // YYYY-MM-DD
  blocks: SampleBlock[];
}

const CATEGORY_POOL = [
  'cat-job',
  'cat-food',
  'cat-learning',
  'cat-workout',
  'cat-gaming',
  'cat-journaling',
  'cat-sleep',
  'cat-project',
  'cat-study',
] as const;

const TITLES: Record<string, string[]> = {
  'cat-job': ['Deep work', 'Inbox zero', 'Standup prep'],
  'cat-food': ['Breakfast', 'Lunch', 'Dinner'],
  'cat-learning': ['Read a chapter', 'Course lesson'],
  'cat-workout': ['Morning run', 'Strength session'],
  'cat-gaming': ['Wind-down game'],
  'cat-journaling': ['Evening journal', 'Morning pages'],
  'cat-sleep': ['Wind down', 'Sleep'],
  'cat-project': ['Build session', 'Ship a fix'],
  'cat-study': ['Revision', 'Practice set'],
};

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic seeded sample dataset: 90 days ending today.
 * Test / preview fixture only — no screen reads this anymore.
 */
export function sampleDataset(daysBack = 90, seed = 20261110): DayRecord[] {
  const rand = mulberry32(seed);
  const days: DayRecord[] = [];
  const today = new Date();
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const blockCount = 4 + Math.floor(rand() * 4);
    const blocks: SampleBlock[] = [];
    const used = new Set<string>();
    for (let j = 0; j < blockCount; j++) {
      const categoryId = CATEGORY_POOL[Math.floor(rand() * CATEGORY_POOL.length)];
      if (used.has(categoryId) && rand() < 0.7) continue;
      used.add(categoryId);
      const r = rand();
      const status: BlockStatus =
        r < 0.62 ? 'complete' : r < 0.78 ? 'complete' : r < 0.88 ? 'missed' : 'progress';
      const onTime = status === 'complete' ? rand() < 0.8 : false;
      const titles = TITLES[categoryId] ?? ['Focus block'];
      blocks.push({
        categoryId,
        title: titles[Math.floor(rand() * titles.length)],
        durationMin: 25 + Math.floor(rand() * 9) * 5,
        status,
        onTime,
        nudgesFired: status === 'complete' && onTime ? Math.floor(rand() * 2) : Math.floor(rand() * 5),
      });
    }
    days.push({ date: dateKey(d), blocks });
  }
  return days;
}

/**
 * Store adapter: build DayRecords from the store's per-date block
 * resolution + flat completions. Usage in a screen:
 *   const days = daysFromStore(useStore((s) => s.getBlocksForDate), useStore((s) => s.completions));
 */
export function daysFromStore(
  getBlocksForDate: (date: string) => Block[],
  completions: CompletionEntry[],
  daysBack = 90,
  endKey?: string,
): DayRecord[] {
  const end = endKey ?? dateKey(new Date());
  const byKey = new Map(completions.map((c) => [`${c.date}:${c.blockId}`, c]));
  const out: DayRecord[] = [];
  const cursor = new Date(end + 'T12:00:00');
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    const key = dateKey(d);
    const blocks: SampleBlock[] = getBlocksForDate(key).map((b) => {
      const entry = byKey.get(`${key}:${b.id}`);
      return {
        categoryId: b.categoryId,
        title: b.title,
        durationMin: b.durationMin,
        status: entry?.status ?? 'upcoming',
        onTime: entry?.onTime ?? false,
        nudgesFired: entry?.nudgesFired ?? 0,
      };
    });
    out.push({ date: key, blocks });
  }
  return out;
}

/** Discipline score for one day, same weighting as core.disciplineScore. */
export function dayScore(day: DayRecord | undefined): number {
  if (!day || day.blocks.length === 0) return 0;
  const total = day.blocks.reduce((s, b) => s + b.durationMin, 0);
  if (total === 0) return 0;
  let earned = 0;
  for (const b of day.blocks) {
    if (b.status === 'complete' && b.onTime) earned += b.durationMin;
    else if (b.status === 'complete') earned += b.durationMin * 0.5;
    else if (b.status === 'progress') earned += b.durationMin * 0.25;
  }
  return Math.round((earned / total) * 100);
}

/** Score 0..100 per date for a given month. */
export function monthlyScores(days: DayRecord[], year: number, month: number): Map<string, number> {
  const out = new Map<string, number>();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(year, month, d));
    out.set(key, dayScore(byDate.get(key)));
  }
  return out;
}

export interface Streaks {
  current: number;
  best: number;
}

/**
 * A "kept" day is one with a score >= 50 (at least half the day done well).
 * Current streak counts back from today (today may still be in progress —
 * an unscored today does not break the streak).
 */
export function computeStreaks(days: DayRecord[], todayKey?: string): Streaks {
  const today = todayKey ?? dateKey(new Date());
  const byDate = new Map(days.map((d) => [d.date, d]));
  const kept = (key: string): boolean => {
    const day = byDate.get(key);
    return !!day && day.blocks.length > 0 && dayScore(day) >= 50;
  };
  let best = 0;
  let run = 0;
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of sorted) {
    if (kept(d.date)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  let current = 0;
  const cursor = new Date(today + 'T12:00:00');
  // If today has no kept day yet, start counting from yesterday.
  if (!kept(today)) cursor.setDate(cursor.getDate() - 1);
  for (let guard = 0; guard < 366; guard++) {
    const key = dateKey(cursor);
    if (!kept(key)) break;
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, best };
}

export interface CategoryFocus {
  categoryId: string;
  minutes: number;
  hours: number;
  pct: number;
}

/** Focus minutes per category across the given days (completed + in-progress time). */
export function perCategoryFocusMinutes(
  days: DayRecord[],
  categoryIds?: string[],
): CategoryFocus[] {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const day of days) {
    for (const b of day.blocks) {
      if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(b.categoryId)) continue;
      if (b.status === 'missed' || b.status === 'skipped') continue;
      totals.set(b.categoryId, (totals.get(b.categoryId) ?? 0) + b.durationMin);
      grand += b.durationMin;
    }
  }
  return [...totals.entries()]
    .map(([categoryId, minutes]) => ({
      categoryId,
      minutes,
      hours: Math.round((minutes / 60) * 10) / 10,
      pct: grand === 0 ? 0 : Math.round((minutes / grand) * 100),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

export interface DaySummary {
  date: string;
  done: number;
  missed: number;
  total: number;
  nudgesNeeded: number;
  onTimePct: number;
  score: number;
}

export function daySummary(days: DayRecord[], date: string): DaySummary {
  const day = days.find((d) => d.date === date);
  if (!day) {
    return { date, done: 0, missed: 0, total: 0, nudgesNeeded: 0, onTimePct: 0, score: 0 };
  }
  const done = day.blocks.filter((b) => b.status === 'complete').length;
  const missed = day.blocks.filter((b) => b.status === 'missed').length;
  const nudgesNeeded = day.blocks.reduce((s, b) => s + b.nudgesFired, 0);
  const onTimePct =
    done === 0
      ? 0
      : Math.round(
          (day.blocks.filter((b) => b.status === 'complete' && b.onTime).length / done) * 100,
        );
  return { date, done, missed, total: day.blocks.length, nudgesNeeded, onTimePct, score: dayScore(day) };
}

/** On-time rate across all days: on-time completions / all completions. */
export function onTimeRate(days: DayRecord[]): number {
  let done = 0;
  let onTime = 0;
  for (const day of days) {
    for (const b of day.blocks) {
      if (b.status === 'complete') {
        done += 1;
        if (b.onTime) onTime += 1;
      }
    }
  }
  return done === 0 ? 0 : Math.round((onTime / done) * 100);
}

/** Scores for the last `n` days ending on `endKey` (default today). */
export function weeklyTrend(days: DayRecord[], n = 7, endKey?: string): { date: string; score: number }[] {
  const end = endKey ?? dateKey(new Date());
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: { date: string; score: number }[] = [];
  const cursor = new Date(end + 'T12:00:00');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    const key = dateKey(d);
    out.push({ date: key, score: dayScore(byDate.get(key)) });
  }
  return out;
}

/**
 * Heatmap pattern geometry (32×32 cell space): line/dot segments for one
 * pattern at a given spacing. Pure, so the Stats screen and tests share it.
 * Each category's pattern (per-category patternForCategory, tokens.ts)
 * is visually distinct from every other, so a heatmap cell's category
 * reads without hue.
 */
export function heatmapPatternSegments(
  pattern: PatternKind,
  spacingPx: number,
): { lines: [number, number, number, number][]; dots: [number, number][] } {
  const lines: [number, number, number, number][] = [];
  const dots: [number, number][] = [];
  if (spacingPx === 0) return { lines, dots };
  if (pattern === 'diag' || pattern === 'cross') {
    for (let k = -32; k <= 0; k += spacingPx) lines.push([k, 32, k + 32, 0]);
  }
  if (pattern === 'diag-rev' || pattern === 'cross') {
    for (let k = -32; k <= 0; k += spacingPx) lines.push([k, 0, k + 32, 32]);
  }
  if (pattern === 'horiz') {
    for (let y = 0; y <= 32; y += spacingPx) lines.push([0, y, 32, y]);
  }
  if (pattern === 'vert') {
    for (let x = 0; x <= 32; x += spacingPx) lines.push([x, 0, x, 32]);
  }
  if (pattern === 'dots') {
    for (let y = spacingPx / 2; y < 32; y += spacingPx) {
      for (let x = spacingPx / 2; x < 32; x += spacingPx) dots.push([x, y]);
    }
  }
  return { lines, dots };
}
