import type { Block, CompletionEntry } from '../types';

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

/** Snap minutes to 5-min grid. */
export function snap5(min: number): number {
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
