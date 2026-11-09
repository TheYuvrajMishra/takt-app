// Takt — zustand store: categories, templates, day overrides, completions,
// settings, selected date. Persists through src/lib/db.ts.
// Day resolution: an override for a date wins; otherwise the template blocks
// whose weekdays include that date's weekday and whose effectiveFrom <= date.
import { create } from 'zustand';
import type {
  Block,
  Category,
  CompletionEntry,
  RoutineTemplate,
  Scope,
  Settings,
  TemplateBlock,
} from '../types';
import type { CategoryColorName } from '../theme/tokens';
import { DEFAULT_DURATION_MIN, DEFAULT_SETTINGS } from '../types';
import { dateKey, defaultDoNotNudgeFor } from '../lib/core';
import * as db from '../lib/db';

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests + reuse by the nudge engine)
// ---------------------------------------------------------------------------

/** Template in force for a date: latest effectiveFrom <= date, else null. */
export function resolveTemplateForDate(
  date: string,
  templates: RoutineTemplate[],
): RoutineTemplate | null {
  if (templates.length === 0) return null;
  const sorted = [...templates].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  );
  let current: RoutineTemplate | null = null;
  for (const t of sorted) {
    if (t.effectiveFrom <= date) current = t;
  }
  return current;
}

/** Blocks for a date: override wins, else template blocks for that weekday. */
export function resolveBlocksForDate(
  date: string,
  templates: RoutineTemplate[],
  overrides: Record<string, Block[]>,
): Block[] {
  const override = overrides[date];
  if (override) return override;
  const template = resolveTemplateForDate(date, templates);
  if (!template) return [];
  const weekday = new Date(`${date}T00:00:00`).getDay();
  return template.blocks
    .filter((b) => b.weekdays.includes(weekday))
    .map((b) => toInstanceBlock(b));
}

function toInstanceBlock(b: TemplateBlock): Block {
  const { weekdays: _weekdays, ...rest } = b;
  return { ...rest, templateBlockId: b.id };
}

/** Latest template overall (the "current active" one). */
export function resolveActiveTemplate(
  templates: RoutineTemplate[],
): RoutineTemplate | null {
  if (templates.length === 0) return null;
  return [...templates].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0,
  )[0];
}

/** 'onwards': patch a template block everywhere it recurs. */
export function updateTemplateBlock(
  template: RoutineTemplate,
  blockId: string,
  patch: Omit<Partial<TemplateBlock>, 'id' | 'weekdays' | 'splitFromId'>,
): RoutineTemplate {
  return {
    ...template,
    blocks: template.blocks.map((b) =>
      b.id === blockId ? { ...b, ...patch } : b,
    ),
  };
}

/** Remove a template block entirely. */
export function removeTemplateBlock(
  template: RoutineTemplate,
  blockId: string,
): RoutineTemplate {
  return { ...template, blocks: template.blocks.filter((b) => b.id !== blockId) };
}

export interface SplitResult {
  template: RoutineTemplate;
  /** Id of the remainder block (the other weekdays), if one was split off. */
  remainderId: string | null;
}

/**
 * 'weekday': split a template block — the copy for `weekday` carries `patch`
 * and KEEPS the original id, so completions keyed by that id (and any
 * in-flight second edit, e.g. a resize after a category patch in the same
 * sheet) keep matching the edited weekday. The remainder (other weekdays)
 * gets a fresh id; the store re-keys that side's past completions to it.
 * If the block recurs only on `weekday`, it is patched in place — no split,
 * no re-id at all.
 */
export function splitTemplateBlockForWeekday(
  template: RoutineTemplate,
  blockId: string,
  weekday: number,
  patch: Omit<Partial<TemplateBlock>, 'id' | 'weekdays' | 'splitFromId'>,
): SplitResult {
  const original = template.blocks.find((b) => b.id === blockId);
  if (!original) return { template, remainderId: null };
  const remaining = original.weekdays.filter((w) => w !== weekday);
  if (remaining.length === 0) {
    return {
      template: updateTemplateBlock(template, blockId, patch),
      remainderId: null,
    };
  }
  const remainderId = db.newId();
  const blocks: TemplateBlock[] = [];
  for (const b of template.blocks) {
    if (b.id !== blockId) {
      blocks.push(b);
      continue;
    }
    blocks.push({ ...b, id: remainderId, weekdays: remaining, splitFromId: b.id });
    blocks.push({ ...b, ...patch, weekdays: [weekday] });
  }
  return { template: { ...template, blocks }, remainderId };
}

/**
 * Resolve the template block id that actually recurs on `weekday` for a
 * possibly-stale `blockId`. After a weekday split the remainder carries
 * `splitFromId` pointing at its parent, so a stale id walks the split
 * chain to the copy that recurs that weekday. Returns null when no copy
 * recurs there (override-only block, or a deleted recurrence) — callers
 * then fall back to a today-only edit instead of touching the wrong copy.
 */
export function resolveBlockIdForDate(
  template: RoutineTemplate,
  blockId: string,
  weekday: number,
): string | null {
  let current = blockId;
  const seen = new Set<string>();
  for (let i = 0; i < 10 && !seen.has(current); i++) {
    seen.add(current);
    const block = template.blocks.find((b) => b.id === current);
    if (block?.weekdays.includes(weekday)) return current;
    const child = template.blocks.find((b) => b.splitFromId === current);
    if (!child) return null;
    current = child.id;
  }
  return null;
}

/** 'weekday' delete: drop `weekday` from the block; drop the block if none left. */
export function removeWeekdayFromTemplate(
  template: RoutineTemplate,
  blockId: string,
  weekday: number,
): RoutineTemplate {
  const original = template.blocks.find((b) => b.id === blockId);
  if (!original) return template;
  const remaining = original.weekdays.filter((w) => w !== weekday);
  if (remaining.length === 0) return removeTemplateBlock(template, blockId);
  return {
    ...template,
    blocks: template.blocks.map((b) =>
      b.id === blockId ? { ...b, weekdays: remaining } : b,
    ),
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const CATEGORY_PALETTE: CategoryColorName[] = [
  'butter',
  'mint',
  'violet',
  'orchid',
  'apricot',
  'carbon',
];

const UNDO_LIMIT = 50;
const SNOOZE_DEFAULT_MIN = 10;

interface Snapshot {
  categories: Category[];
  templates: RoutineTemplate[];
  dayOverrides: Record<string, Block[]>;
  completions: CompletionEntry[];
  settings: Settings;
}

export interface ToastHandler {
  (message: string): void;
}

/** Hook the nudge engine (or UI) registers to re-run after any mutation. */
let afterChangeHook: (() => void) | null = null;
export function setAfterChangeHook(fn: (() => void) | null): void {
  afterChangeHook = fn;
}

function notifyAfterChange(): void {
  if (afterChangeHook) {
    try {
      afterChangeHook();
    } catch {
      // A failing hook must never break the store mutation itself.
    }
  }
}

export interface TaktState {
  hydrated: boolean;
  categories: Category[];
  templates: RoutineTemplate[];
  activeTemplateId: string | null;
  dayOverrides: Record<string, Block[]>;
  completions: CompletionEntry[];
  settings: Settings;
  selectedDate: string;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  /** Last toast message (UI reads this; also forwarded to toastHandler). */
  lastToast: string | null;
  toastHandler: ToastHandler | null;

  load: () => Promise<void>;
  setSelectedDate: (date: string) => void;
  setToastHandler: (fn: ToastHandler | null) => void;
  showToast: (message: string) => void;

  getActiveTemplate: () => RoutineTemplate | null;
  getBlocksForDate: (date: string) => Block[];
  getCompletion: (blockId: string, date: string) => CompletionEntry | undefined;

  addBlock: (
    input: Omit<Block, 'id'> & { id?: string },
    date: string,
    scope: Scope,
  ) => Promise<void>;
  moveBlock: (
    blockId: string,
    date: string,
    newStartMin: number,
    scope: Scope,
  ) => Promise<void>;
  resizeBlock: (
    blockId: string,
    date: string,
    newDurationMin: number,
    scope: Scope,
  ) => Promise<void>;
  patchBlock: (
    blockId: string,
    date: string,
    patch: Partial<
      Pick<
        Block,
        'categoryId' | 'subcategoryId' | 'title' | 'notes' | 'doNotNudge' | 'alarmMode'
      >
    >,
    scope: Scope,
  ) => Promise<void>;
  deleteBlock: (blockId: string, date: string, scope: Scope) => Promise<void>;

  markDone: (blockId: string, date: string) => Promise<void>;
  markStarted: (blockId: string, date: string) => Promise<void>;
  snooze: (blockId: string, date: string, minutes?: number) => Promise<void>;
  skip: (blockId: string, date: string) => Promise<void>;

  addCategory: (name: string, icon?: string) => Promise<Category>;
  editCategory: (id: string, patch: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (idsInOrder: string[]) => Promise<void>;

  saveTemplate: (template: RoutineTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Group several store ops under ONE undo entry (one user gesture). */
  beginUndoBatch: () => void;
  endUndoBatch: () => void;
}

function snapshotOf(s: TaktState): Snapshot {
  return {
    categories: s.categories,
    templates: s.templates,
    dayOverrides: s.dayOverrides,
    completions: s.completions,
    settings: s.settings,
  };
}

async function persistSnapshot(s: Snapshot): Promise<void> {
  await Promise.all([
    db.replaceCategories(s.categories),
    db.replaceTemplates(s.templates),
    db.replaceDayOverrides(s.dayOverrides),
    db.replaceCompletions(s.completions),
    db.saveSettings(s.settings),
  ]);
}

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export const useStore = create<TaktState>()((set, get) => {
  /** Undo-batch depth: while > 0, mutations inside the batch share the
   * single snapshot taken (lazily) on the batch's first mutation. */
  let undoBatchDepth = 0;
  /** True once the open batch has snapshotted. The snapshot is LAZY: it is
   * taken on the first mutation inside the batch, not at begin — so an
   * empty batch (a paste/duplicate/template with no room) plants no
   * no-op undo entry and does not wipe the redo stack. */
  let undoBatchSnapshotTaken = false;

  /** Snapshot current state onto the undo stack (call BEFORE mutating). */
  function pushUndo(): void {
    if (undoBatchDepth > 0) {
      if (!undoBatchSnapshotTaken) {
        undoBatchSnapshotTaken = true;
        snapshotUndo();
      }
      return;
    }
    snapshotUndo();
  }

  /** Push the pre-mutation snapshot and clear redo (shared by pushUndo). */
  function snapshotUndo(): void {
    const s = get();
    const undoStack = [...s.undoStack, snapshotOf(s)].slice(-UNDO_LIMIT);
    set({ undoStack, redoStack: [] });
  }

  function emitToast(message: string): void {
    const handler = get().toastHandler;
    set({ lastToast: message });
    if (handler) {
      try {
        handler(message);
      } catch {
        // Toast display must never break the mutation.
      }
    }
  }

  /** Ensure there is an active template to edit; creates a blank one if needed. */
  async function ensureTemplate(date: string): Promise<RoutineTemplate> {
    const s = get();
    let template = s.activeTemplateId
      ? (s.templates.find((t) => t.id === s.activeTemplateId) ?? null)
      : null;
    template ??= resolveActiveTemplate(s.templates);
    if (!template) {
      template = {
        id: db.newId(),
        name: 'My routine',
        effectiveFrom: date,
        blocks: [],
      };
      await db.saveTemplate(template);
      set({
        templates: [...s.templates, template],
        activeTemplateId: template.id,
      });
    }
    return template;
  }

  /** Persist one edited template and update state. */
  async function commitTemplate(next: RoutineTemplate): Promise<void> {
    await db.saveTemplate(next);
    set((s) => ({
      templates: s.templates.map((t) => (t.id === next.id ? next : t)),
    }));
  }

  /** Write a day override (full block list for that date) and update state. */
  async function commitOverride(date: string, blocks: Block[]): Promise<void> {
    await db.saveDayOverride({ date, blocks });
    set((s) => ({ dayOverrides: { ...s.dayOverrides, [date]: blocks } }));
  }

  /**
   * A weekday/onwards edit must not be shadowed by a day override for that
   * date (e.g. a drag auto-shifted neighbours into a 'today' override that
   * froze the freshly split primary): sync just the edited fields onto the
   * override's copy of the block. Other fields in the override (e.g. a
   * neighbour's today-only shifted position) are left untouched.
   * Semantics (deliberate): the latest explicit instruction wins for the
   * edited fields. If the user first moved a block today-only and then
   * moves it weekday-scope, the scoped move supersedes today's deviation
   * for that block — today IS that weekday, so the scoped value is what
   * they just asked for.
   */
  async function syncOverrideForScopedEdit(
    date: string,
    blockId: string,
    patch: Partial<Block>,
  ): Promise<void> {
    const override = get().dayOverrides[date];
    if (!override || !override.some((b) => b.id === blockId)) return;
    await commitOverride(
      date,
      override.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    );
  }

  /** Upsert a completion entry and update state. */
  async function commitCompletion(entry: CompletionEntry): Promise<void> {
    await db.saveCompletion(entry);
    set((s) => ({
      completions: [
        ...s.completions.filter(
          (c) => !(c.blockId === entry.blockId && c.date === entry.date),
        ),
        entry,
      ],
    }));
  }

  /**
   * Which completions must follow the remainder block after a weekday split:
   * those keyed by the old id on dates whose weekday is in the remainder
   * set. Skipped: the edited weekday (its copy kept the old id), dates
   * whose weekday never recurs (e.g. a one-off override instance), and
   * dates governed by a different template version. Override-shadowed
   * dates migrate too — their override copies are re-keyed in the same
   * pass, so the completion must follow.
   */
  function splitRekeys(
    templateId: string,
    oldId: string,
    remainderId: string,
    weekday: number,
    remainderWeekdays: number[],
    completions: CompletionEntry[],
    templates: RoutineTemplate[],
  ): { oldBlockId: string; newBlockId: string; date: string }[] {
    return completions
      .filter((c) => {
        if (c.blockId !== oldId) return false;
        const w = new Date(`${c.date}T00:00:00`).getDay();
        if (w === weekday) return false;
        if (!remainderWeekdays.includes(w)) return false;
        return resolveTemplateForDate(c.date, templates)?.id === templateId;
      })
      .map((c) => ({ oldBlockId: oldId, newBlockId: remainderId, date: c.date }));
  }

  /**
   * Split a template block for one weekday and persist it atomically with
   * the other weekdays' completion re-keying (one sqlite transaction, so a
   * crash can never leave the split saved and the completions behind).
   * After the await, state is re-read and the re-keying re-applied onto the
   * fresh array, so a Done tap landing mid-split is never wiped by a stale
   * snapshot. Runs inside the same undo snapshot as the split.
   */
  async function applyWeekdaySplit(
    template: RoutineTemplate,
    blockId: string,
    weekday: number,
    patch: Omit<Partial<TemplateBlock>, 'id' | 'weekdays' | 'splitFromId'>,
  ): Promise<void> {
    const { template: next, remainderId } = splitTemplateBlockForWeekday(
      template,
      blockId,
      weekday,
      patch,
    );
    if (!remainderId) {
      await commitTemplate(next);
      return;
    }
    const remainderWeekdays =
      next.blocks.find((b) => b.id === remainderId)?.weekdays ?? [];
    const s = get();
    const rekeys = splitRekeys(
      template.id,
      blockId,
      remainderId,
      weekday,
      remainderWeekdays,
      s.completions,
      s.templates,
    );
    // Day-override copies on remainder weekdays still carry the old id.
    // Re-key them to the remainder id, or a later scoped edit of that date
    // would resolve the stale id to the WRONG copy (the edited weekday's)
    // and mutate it. Same pass shape as splitRekeys, but for overrides.
    const overrideRekeys = Object.entries(s.dayOverrides)
      .filter(([date, blocks]) => {
        const w = new Date(`${date}T00:00:00`).getDay();
        if (w === weekday) return false;
        if (!remainderWeekdays.includes(w)) return false;
        return blocks.some((b) => b.id === blockId);
      })
      .map(([date, blocks]) => ({
        date,
        blocks: blocks.map((b) =>
          b.id === blockId ? { ...b, id: remainderId } : b,
        ),
      }));
    await db.saveTemplateWithCompletionRekey(next, rekeys, overrideRekeys);
    const fresh = get();
    const freshRekeys = splitRekeys(
      template.id,
      blockId,
      remainderId,
      weekday,
      remainderWeekdays,
      fresh.completions,
      fresh.templates,
    );
    const alreadyDone = new Set(rekeys.map((r) => r.date));
    const delta = freshRekeys.filter((r) => !alreadyDone.has(r.date));
    if (delta.length > 0) await db.rekeyCompletions(delta);
    // Functional set: the affected dates are recomputed from the latest
    // state at set time, so anything that landed during the awaits above
    // (e.g. a Done tap) is re-keyed in memory too instead of being wiped
    // by a stale snapshot read.
    set((s) => {
      const affected = new Set(
        splitRekeys(
          template.id,
          blockId,
          remainderId,
          weekday,
          remainderWeekdays,
          s.completions,
          s.templates,
        ).map((r) => r.date),
      );
      const nextOverrides = { ...s.dayOverrides };
      for (const o of overrideRekeys) {
        const latest = nextOverrides[o.date];
        if (latest?.some((b) => b.id === blockId)) {
          nextOverrides[o.date] = latest.map((b) =>
            b.id === blockId ? { ...b, id: remainderId } : b,
          );
        }
      }
      return {
        templates: s.templates.map((t) => (t.id === next.id ? next : t)),
        completions: s.completions.map((c) =>
          c.blockId === blockId && affected.has(c.date)
            ? { ...c, blockId: remainderId }
            : c,
        ),
        dayOverrides: nextOverrides,
      };
    });
  }

  return {
    hydrated: false,
    categories: [],
    templates: [],
    activeTemplateId: null,
    dayOverrides: {},
    completions: [],
    settings: { ...DEFAULT_SETTINGS },
    selectedDate: dateKey(new Date()),
    undoStack: [],
    redoStack: [],
    lastToast: null,
    toastHandler: null,

    load: async () => {
      await db.initDb();
      const [categories, templates, overrides, completions, settings] =
        await Promise.all([
          db.getCategories(),
          db.getTemplates(),
          db.getAllDayOverrides(),
          db.getAllCompletions(),
          db.getSettings(),
        ]);
      const dayOverrides: Record<string, Block[]> = {};
      for (const o of overrides) dayOverrides[o.date] = o.blocks;
      const active = resolveActiveTemplate(templates);
      set({
        hydrated: true,
        categories,
        templates,
        activeTemplateId: active ? active.id : null,
        dayOverrides,
        completions,
        settings,
      });
    },

    setSelectedDate: (date) => set({ selectedDate: date }),

    setToastHandler: (fn) => set({ toastHandler: fn }),

    showToast: (message) => emitToast(message),

    getActiveTemplate: () => {
      const s = get();
      return (
        s.templates.find((t) => t.id === s.activeTemplateId) ??
        resolveActiveTemplate(s.templates)
      );
    },

    getBlocksForDate: (date) => {
      const s = get();
      return resolveBlocksForDate(date, s.templates, s.dayOverrides);
    },

    getCompletion: (blockId, date) =>
      get().completions.find((c) => c.blockId === blockId && c.date === date),

    addBlock: async (input, date, scope) => {
      pushUndo();
      const weekday = new Date(`${date}T00:00:00`).getDay();
      // "Do not nudge" defaults: an explicit doNotNudge on the input wins;
      // otherwise the global default or the block's category decides.
      const settings = get().settings;
      const doNotNudge =
        input.doNotNudge ?? defaultDoNotNudgeFor(settings, input.categoryId);
      if (scope === 'today') {
        const blocks = get().getBlocksForDate(date);
        const block: Block = {
          ...input,
          id: input.id ?? db.newId(),
          durationMin: input.durationMin || DEFAULT_DURATION_MIN,
          doNotNudge,
        };
        await commitOverride(date, [...blocks, block]);
        emitToast(doNotNudge ? 'Added for today only — won\'t nudge.' : 'Added for today only.');
      } else {
        const template = await ensureTemplate(date);
        const templateBlock: TemplateBlock = {
          ...input,
          id: input.id ?? db.newId(),
          durationMin: input.durationMin || DEFAULT_DURATION_MIN,
          doNotNudge,
          weekdays: scope === 'onwards' ? [0, 1, 2, 3, 4, 5, 6] : [weekday],
        };
        const next: RoutineTemplate = {
          ...template,
          // 'onwards'/'weekday' from a past date must apply from that date.
          effectiveFrom:
            template.effectiveFrom > date ? date : template.effectiveFrom,
          blocks: [...template.blocks, templateBlock],
        };
        await commitTemplate(next);
        emitToast(
          doNotNudge
            ? scope === 'onwards'
              ? 'Added from today onwards — won\'t nudge.'
              : 'Added for this weekday onwards — won\'t nudge.'
            : scope === 'onwards'
              ? 'Added from today onwards.'
              : 'Added for this weekday onwards.',
        );
      }
      notifyAfterChange();
    },

    moveBlock: async (blockId, date, newStartMin, scope) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get().getBlocksForDate(date);
        if (!blocks.some((b) => b.id === blockId)) {
          // No-op guard: a stale/missing id must not plant a phantom undo
          // entry (and wipe redo) for a block that is nowhere on this day.
          // pushUndo runs only on branches that actually mutate, below.
          emitToast('That block no longer exists on this day.');
          return;
        }
        pushUndo();
        await commitOverride(
          date,
          blocks.map((b) => (b.id === blockId ? { ...b, startMin: newStartMin } : b)),
        );
        emitToast('Moved for today only.');
      } else {
        const template = await ensureTemplate(date);
        // A stale id (held from before a split) walks the split chain to
        // the copy that actually recurs on this weekday; null means the
        // block only exists in a day override (or nowhere on this date).
        const resolvedId = resolveBlockIdForDate(template, blockId, weekday);
        if (!resolvedId) {
          const blocks = get().getBlocksForDate(date);
          if (!blocks.some((b) => b.id === blockId)) {
            emitToast('That block no longer exists on this day.');
            return;
          }
          pushUndo();
          await commitOverride(
            date,
            blocks.map((b) =>
              b.id === blockId ? { ...b, startMin: newStartMin } : b,
            ),
          );
          emitToast('That block only exists today, so it moved for today only.');
        } else if (scope === 'onwards') {
          pushUndo();
          await commitTemplate(
            updateTemplateBlock(template, resolvedId, { startMin: newStartMin }),
          );
          emitToast('Moved from today onwards.');
        } else {
          pushUndo();
          await applyWeekdaySplit(template, resolvedId, weekday, {
            startMin: newStartMin,
          });
          emitToast('Moved for this weekday onwards.');
        }
        if (resolvedId) {
          await syncOverrideForScopedEdit(date, resolvedId, { startMin: newStartMin });
        }
      }
      notifyAfterChange();
    },

    resizeBlock: async (blockId, date, newDurationMin, scope) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get().getBlocksForDate(date);
        if (!blocks.some((b) => b.id === blockId)) {
          // No-op guard (see moveBlock): pushUndo only where a mutation
          // will actually land.
          emitToast('That block no longer exists on this day.');
          return;
        }
        pushUndo();
        await commitOverride(
          date,
          blocks.map((b) =>
            b.id === blockId ? { ...b, durationMin: newDurationMin } : b,
          ),
        );
        emitToast('Resized for today only.');
      } else {
        const template = await ensureTemplate(date);
        // Stale ids resolve through the split chain (see moveBlock).
        const resolvedId = resolveBlockIdForDate(template, blockId, weekday);
        if (!resolvedId) {
          const blocks = get().getBlocksForDate(date);
          if (!blocks.some((b) => b.id === blockId)) {
            emitToast('That block no longer exists on this day.');
            return;
          }
          pushUndo();
          await commitOverride(
            date,
            blocks.map((b) =>
              b.id === blockId ? { ...b, durationMin: newDurationMin } : b,
            ),
          );
          emitToast('That block only exists today, so it resized for today only.');
        } else if (scope === 'onwards') {
          pushUndo();
          await commitTemplate(
            updateTemplateBlock(template, resolvedId, {
              durationMin: newDurationMin,
            }),
          );
          emitToast('Resized from today onwards.');
        } else {
          pushUndo();
          await applyWeekdaySplit(template, resolvedId, weekday, {
            durationMin: newDurationMin,
          });
          emitToast('Resized for this weekday onwards.');
        }
        if (resolvedId) {
          await syncOverrideForScopedEdit(date, resolvedId, {
            durationMin: newDurationMin,
          });
        }
      }
      notifyAfterChange();
    },

    patchBlock: async (blockId, date, patch, scope) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get().getBlocksForDate(date);
        if (!blocks.some((b) => b.id === blockId)) {
          // No-op guard (see moveBlock): pushUndo only where a mutation
          // will actually land.
          emitToast('That block no longer exists on this day.');
          return;
        }
        pushUndo();
        await commitOverride(
          date,
          blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
        );
        emitToast('Updated for today only.');
      } else {
        const template = await ensureTemplate(date);
        // Stale ids resolve through the split chain (see moveBlock).
        const resolvedId = resolveBlockIdForDate(template, blockId, weekday);
        if (!resolvedId) {
          const blocks = get().getBlocksForDate(date);
          if (!blocks.some((b) => b.id === blockId)) {
            emitToast('That block no longer exists on this day.');
            return;
          }
          pushUndo();
          await commitOverride(
            date,
            blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
          );
          emitToast('That block only exists today, so it updated for today only.');
        } else if (scope === 'onwards') {
          pushUndo();
          await commitTemplate(updateTemplateBlock(template, resolvedId, patch));
          emitToast('Updated from today onwards.');
        } else {
          pushUndo();
          await applyWeekdaySplit(template, resolvedId, weekday, patch);
          emitToast('Updated for this weekday onwards.');
        }
        if (resolvedId) {
          await syncOverrideForScopedEdit(date, resolvedId, patch);
        }
      }
      notifyAfterChange();
    },

    deleteBlock: async (blockId, date, scope) => {
      pushUndo();
      const weekday = new Date(`${date}T00:00:00`).getDay();
      // Stale ids resolve through the split chain (see moveBlock).
      let targetId = blockId;
      if (scope === 'today') {
        const blocks = get()
          .getBlocksForDate(date)
          .filter((b) => b.id !== blockId);
        await commitOverride(date, blocks);
        emitToast('Deleted for today only.');
      } else {
        const template = await ensureTemplate(date);
        targetId = resolveBlockIdForDate(template, blockId, weekday) ?? blockId;
        if (scope === 'onwards') {
          await commitTemplate(removeTemplateBlock(template, targetId));
          emitToast('Deleted from today onwards.');
        } else {
          await commitTemplate(
            removeWeekdayFromTemplate(template, targetId, weekday),
          );
          emitToast('Deleted for this weekday onwards.');
        }
        // A today override shadowing the template must not resurrect the block.
        const override = get().dayOverrides[date];
        if (override && override.some((b) => b.id === targetId)) {
          await commitOverride(
            date,
            override.filter((b) => b.id !== targetId),
          );
        }
      }
      await db.deleteCompletion(targetId, date);
      set((s) => ({
        completions: s.completions.filter(
          (c) => !(c.blockId === targetId && c.date === date),
        ),
      }));
      notifyAfterChange();
    },

    markDone: async (blockId, date) => {
      pushUndo();
      const block = get().getBlocksForDate(date).find((b) => b.id === blockId);
      const doneMin = minutesNow();
      const onTime = block ? doneMin <= block.startMin + block.durationMin : false;
      const prev = get().getCompletion(blockId, date);
      await commitCompletion({
        blockId,
        date,
        status: 'complete',
        doneAt: new Date().toISOString(),
        onTime,
        nudgesFired: prev?.nudgesFired ?? 0,
        startedAt: prev?.startedAt,
      });
      emitToast('Done. Nice work.');
      notifyAfterChange();
    },

    markStarted: async (blockId, date) => {
      const prev = get().getCompletion(blockId, date);
      if (prev?.status === 'complete') return;
      pushUndo();
      await commitCompletion({
        blockId,
        date,
        status: 'progress',
        doneAt: undefined,
        onTime: prev?.onTime,
        nudgesFired: prev?.nudgesFired ?? 0,
        startedAt: new Date().toISOString(),
      });
      emitToast('Started. Keep going.');
      notifyAfterChange();
    },

    snooze: async (blockId, date, minutes = SNOOZE_DEFAULT_MIN) => {
      // No-op guard BEFORE pushUndo: snoozing a missing/stale block (e.g.
      // from a notification for a deleted block) must not plant a phantom
      // undo entry or wipe redo.
      const blocks = get().getBlocksForDate(date);
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;
      pushUndo();
      const nextStart = Math.min(
        block.startMin + minutes,
        24 * 60 - block.durationMin,
      );
      await commitOverride(
        date,
        blocks.map((b) => (b.id === blockId ? { ...b, startMin: nextStart } : b)),
      );
      emitToast(`Snoozed ${minutes} minutes.`);
      notifyAfterChange();
    },

    skip: async (blockId, date) => {
      pushUndo();
      const prev = get().getCompletion(blockId, date);
      await commitCompletion({
        blockId,
        date,
        status: 'skipped',
        doneAt: prev?.doneAt,
        onTime: prev?.onTime,
        nudgesFired: prev?.nudgesFired ?? 0,
        startedAt: prev?.startedAt,
      });
      emitToast('Skipped for today.');
      notifyAfterChange();
    },

    addCategory: async (name, icon = 'custom') => {
      pushUndo();
      const s = get();
      const category: Category = {
        id: db.newId(),
        name,
        color: CATEGORY_PALETTE[s.categories.length % CATEGORY_PALETTE.length],
        icon,
        usageCount: 0,
      };
      await db.saveCategory(category, s.categories.length);
      set({ categories: [...s.categories, category] });
      emitToast(`Category ${name} added.`);
      notifyAfterChange();
      return category;
    },

    editCategory: async (id, patch) => {
      // No-op guard BEFORE pushUndo (see moveBlock): an unknown id must
      // not plant a phantom undo entry for an unchanged list.
      if (!get().categories.some((c) => c.id === id)) return;
      pushUndo();
      const s = get();
      const next = s.categories.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      );
      const edited = next.find((c) => c.id === id);
      if (edited) await db.saveCategory(edited);
      set({ categories: next });
      emitToast('Category updated.');
      notifyAfterChange();
    },

    deleteCategory: async (id) => {
      // No-op guard BEFORE pushUndo (see moveBlock).
      if (!get().categories.some((c) => c.id === id)) return;
      pushUndo();
      await db.deleteCategory(id);
      set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
      emitToast('Category deleted.');
      notifyAfterChange();
    },

    reorderCategories: async (idsInOrder) => {
      pushUndo();
      const s = get();
      const byId = new Map(s.categories.map((c) => [c.id, c]));
      const next = idsInOrder
        .map((id) => byId.get(id))
        .filter((c): c is Category => Boolean(c));
      // Keep any categories missing from the order at the end, in place.
      for (const c of s.categories) if (!idsInOrder.includes(c.id)) next.push(c);
      await db.reorderCategories(next.map((c) => c.id));
      set({ categories: next });
      notifyAfterChange();
    },

    saveTemplate: async (template) => {
      pushUndo();
      await db.saveTemplate(template);
      set((s) => ({
        templates: s.templates.some((t) => t.id === template.id)
          ? s.templates.map((t) => (t.id === template.id ? template : t))
          : [...s.templates, template],
        activeTemplateId: template.id,
      }));
      emitToast('Routine saved.');
      notifyAfterChange();
    },

    deleteTemplate: async (id) => {
      pushUndo();
      await db.deleteTemplate(id);
      set((s) => {
        const templates = s.templates.filter((t) => t.id !== id);
        const active = resolveActiveTemplate(templates);
        return {
          templates,
          activeTemplateId: active ? active.id : null,
        };
      });
      emitToast('Routine deleted.');
      notifyAfterChange();
    },

    updateSettings: async (patch) => {
      pushUndo();
      const prev = get().settings;
      const next: Settings = { ...prev, ...patch };
      // Optimistic: state lands synchronously, so rapid toggles each read
      // fresh state (a slow sqlite write must never lose a tap). If the
      // write fails, revert to the previous settings and say so.
      set({ settings: next });
      try {
        await db.saveSettings(next);
      } catch {
        // Only revert if nothing newer landed meanwhile: a later
        // toggle's save already persisted this change too (its `next`
        // merged it in), so reverting to this call's `prev` would wipe
        // the later tap.
        if (get().settings === next) {
          set({ settings: prev });
          emitToast('Could not save that setting.');
        }
      }
      notifyAfterChange();
    },

    undo: async () => {
      // A gesture is mid-flight: its snapshot is not final yet, so popping
      // the stack now would strand the rest of the batch un-undoable.
      if (undoBatchDepth > 0) return;
      const s = get();
      const prev = s.undoStack[s.undoStack.length - 1];
      if (!prev) return;
      await persistSnapshot(prev);
      set({
        categories: prev.categories,
        templates: prev.templates,
        dayOverrides: prev.dayOverrides,
        completions: prev.completions,
        settings: prev.settings,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshotOf(s)],
      });
      emitToast('Undone.');
      notifyAfterChange();
    },

    redo: async () => {
      if (undoBatchDepth > 0) return;
      const s = get();
      const next = s.redoStack[s.redoStack.length - 1];
      if (!next) return;
      await persistSnapshot(next);
      set({
        categories: next.categories,
        templates: next.templates,
        dayOverrides: next.dayOverrides,
        completions: next.completions,
        settings: next.settings,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshotOf(s)],
      });
      emitToast('Redone.');
      notifyAfterChange();
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    beginUndoBatch: () => {
      undoBatchDepth += 1;
    },
    endUndoBatch: () => {
      undoBatchDepth = Math.max(0, undoBatchDepth - 1);
      if (undoBatchDepth === 0) undoBatchSnapshotTaken = false;
    },
  };
});
