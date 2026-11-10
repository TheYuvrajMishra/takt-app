import type { Block, CompletionEntry, Settings } from '../types';

/** minutes from midnight -> "07:30" */
export function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Discipline score 0..100: on-time completions weighted by duration, partial credit for late. */
export function disciplineScore(blocks: Block[], log: CompletionEntry[]): number {
  const total = blocks.reduce((s, b) => s + b.durationMin, 0);
  if (total === 0) return 0;
  let earned = 0;
  for (const b of blocks) {
    const e = log.find((x) => x.blockId === b.id);
    if (!e) continue;
    if (e.status === 'complete' && e.onTime) earned += b.durationMin;
    else if (e.status === 'complete') earned += b.durationMin * 0.5;
    else if (e.status === 'progress') earned += b.durationMin * 0.25;
  }
  return Math.round((earned / total) * 100);
}

// ---- day mini-timeline (Today hero) --------------------------------------
// The hero shows a sneak peek of the day's timeline: one horizontal bar
// covering the first block's start to the last block's end, with a
// colour-coded segment per block and the free gaps left empty, so the
// user sees at a glance where they are free. Segments are non-overlapping
// and cover [range.start, range.end] exactly, so their flex proportions
// are the time proportions (an overlapping later block is clamped to the
// previous block's end; a fully covered block is dropped).
export interface DayTimelineSegment {
  kind: 'block' | 'free';
  startMin: number;
  endMin: number;
  block?: Block;
}

export function timelineRange(blocks: Block[]): { start: number; end: number } | null {
  if (blocks.length === 0) return null;
  return {
    start: Math.min(...blocks.map((b) => b.startMin)),
    end: Math.max(...blocks.map((b) => blockEnd(b))),
  };
}

export function dayTimelineSegments(blocks: Block[]): DayTimelineSegment[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const segs: DayTimelineSegment[] = [];
  let cursor: number | null = null;
  for (const b of sorted) {
    const start = b.startMin;
    const end = blockEnd(b);
    if (cursor === null) {
      cursor = start;
    } else if (start > cursor) {
      segs.push({ kind: 'free', startMin: cursor, endMin: start });
      cursor = start;
    } else if (end <= cursor) {
      continue; // fully covered by an earlier block
    }
    const effStart = Math.max(start, cursor);
    segs.push({ kind: 'block', startMin: effStart, endMin: end, block: b });
    cursor = end;
  }
  return segs;
}

/** A minute's position on the timeline as a percentage, clamped 0..100. */
export function timelinePct(min: number, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.max(0, Math.min(100, ((min - start) / (end - start)) * 100));
}

/** minutes -> "3 h 05 min" / "8 h" / "45 min" (for the hero's "X of Y" line). */
export function fmtHoursMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function blockEnd(b: Block): number {
  return b.startMin + b.durationMin;
}

export function overlaps(a: Block, b: Block): boolean {
  return a.startMin < blockEnd(b) && b.startMin < blockEnd(a);
}

/** Earliest empty slot of `durationMin` minutes from `fromMin` onwards today (5-min grid). */
export function earliestEmptySlot(blocks: Block[], fromMin: number, durationMin: number): number | null {
  const sorted = [...blocks].sort((x, y) => x.startMin - y.startMin);
  let t = Math.ceil(fromMin / 5) * 5;
  for (let guard = 0; guard < 288; guard++) {
    if (t + durationMin > 24 * 60) return null;
    const probe: Block = { id: '__probe__', categoryId: '', title: '', startMin: t, durationMin };
    if (!sorted.some((b) => overlaps(probe, b))) return t;
    // jump past the conflicting block
    const clash = sorted.find((b) => overlaps(probe, b))!;
    t = Math.ceil(blockEnd(clash) / 5) * 5;
  }
  return null;
}

/** Snap minutes to 5-min grid. Called from gesture worklets (BlockCard
    drag/resize) as well as the JS thread, so it must be a worklet — a plain
    function called from a worklet throws "[Worklets] Tried to
    synchronously call a Remote Function" on device (hit 2026-11-10). */
export function snap5(min: number): number {
  'worklet';
  return Math.round(min / 5) * 5;
}

/** Nudge schedule for one block: start + repeats every interval until end+60min, capped. */
export function nudgeTimes(
  block: Block,
  intervalMin: number,
  maxNudges: number,
): number[] {
  const times: number[] = [];
  let t = block.startMin;
  const stop = blockEnd(block) + 60;
  while (t <= stop && times.length < maxNudges) {
    times.push(t);
    t += intervalMin;
  }
  return times;
}

export function isInQuietHours(min: number, start: string, end: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s <= e) return min >= s && min < e;
  return min >= s || min < e; // overnight range
}

/** Whether a NEW block in this category is silenced by the Do-not-nudge
 * defaults (global default, or the category's own default). Explicit
 * per-block flags win over this — it only decides the default. */
export function defaultDoNotNudgeFor(
  settings: Settings,
  categoryId: string,
): boolean {
  return (
    settings.defaultDoNotNudge ||
    settings.doNotNudgeCategoryIds.includes(categoryId)
  );
}
