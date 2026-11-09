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
import { dateKey } from '../lib/core';
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
  patch: Partial<TemplateBlock>,
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

/**
 * 'weekday': split a template block — the original loses `weekday`, and a copy
 * carrying `patch` recurs on `weekday` only. Returns the new template.
 */
export function splitTemplateBlockForWeekday(
  template: RoutineTemplate,
  blockId: string,
  weekday: number,
  patch: Partial<TemplateBlock>,
): RoutineTemplate {
  const original = template.blocks.find((b) => b.id === blockId);
  if (!original) return template;
  const remaining = original.weekdays.filter((w) => w !== weekday);
  const blocks: TemplateBlock[] = [];
  for (const b of template.blocks) {
    if (b.id !== blockId) {
      blocks.push(b);
      continue;
    }
    if (remaining.length > 0) blocks.push({ ...b, weekdays: remaining });
    blocks.push({
      ...b,
      ...patch,
      id: db.newId(),
      weekdays: [weekday],
    });
  }
  return { ...template, blocks };
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
  return updateTemplateBlock(template, blockId, { weekdays: remaining });
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
  /** Snapshot current state onto the undo stack (call BEFORE mutating). */
  function pushUndo(): void {
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
      if (scope === 'today') {
        const blocks = get().getBlocksForDate(date);
        const block: Block = {
          ...input,
          id: input.id ?? db.newId(),
          durationMin: input.durationMin || DEFAULT_DURATION_MIN,
        };
        await commitOverride(date, [...blocks, block]);
        emitToast('Added for today only.');
      } else {
        const template = await ensureTemplate(date);
        const templateBlock: TemplateBlock = {
          ...input,
          id: input.id ?? db.newId(),
          durationMin: input.durationMin || DEFAULT_DURATION_MIN,
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
          scope === 'onwards'
            ? 'Added from today onwards.'
            : 'Added for this weekday onwards.',
        );
      }
      notifyAfterChange();
    },

    moveBlock: async (blockId, date, newStartMin, scope) => {
      pushUndo();
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get()
          .getBlocksForDate(date)
          .map((b) => (b.id === blockId ? { ...b, startMin: newStartMin } : b));
        await commitOverride(date, blocks);
        emitToast('Moved for today only.');
      } else {
        const template = await ensureTemplate(date);
        const found = template.blocks.some((b) => b.id === blockId);
        if (!found) {
          // Override-only block: fall back to a today-only move.
          const blocks = get()
            .getBlocksForDate(date)
            .map((b) => (b.id === blockId ? { ...b, startMin: newStartMin } : b));
          await commitOverride(date, blocks);
          emitToast('That block only exists today, so it moved for today only.');
        } else if (scope === 'onwards') {
          await commitTemplate(
            updateTemplateBlock(template, blockId, { startMin: newStartMin }),
          );
          emitToast('Moved from today onwards.');
        } else {
          await commitTemplate(
            splitTemplateBlockForWeekday(template, blockId, weekday, {
              startMin: newStartMin,
            }),
          );
          emitToast('Moved for this weekday onwards.');
        }
      }
      notifyAfterChange();
    },

    resizeBlock: async (blockId, date, newDurationMin, scope) => {
      pushUndo();
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get()
          .getBlocksForDate(date)
          .map((b) =>
            b.id === blockId ? { ...b, durationMin: newDurationMin } : b,
          );
        await commitOverride(date, blocks);
        emitToast('Resized for today only.');
      } else {
        const template = await ensureTemplate(date);
        const found = template.blocks.some((b) => b.id === blockId);
        if (!found) {
          const blocks = get()
            .getBlocksForDate(date)
            .map((b) =>
              b.id === blockId ? { ...b, durationMin: newDurationMin } : b,
            );
          await commitOverride(date, blocks);
          emitToast('That block only exists today, so it resized for today only.');
        } else if (scope === 'onwards') {
          await commitTemplate(
            updateTemplateBlock(template, blockId, {
              durationMin: newDurationMin,
            }),
          );
          emitToast('Resized from today onwards.');
        } else {
          await commitTemplate(
            splitTemplateBlockForWeekday(template, blockId, weekday, {
              durationMin: newDurationMin,
            }),
          );
          emitToast('Resized for this weekday onwards.');
        }
      }
      notifyAfterChange();
    },

    patchBlock: async (blockId, date, patch, scope) => {
      pushUndo();
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get()
          .getBlocksForDate(date)
          .map((b) => (b.id === blockId ? { ...b, ...patch } : b));
        await commitOverride(date, blocks);
        emitToast('Updated for today only.');
      } else {
        const template = await ensureTemplate(date);
        const found = template.blocks.some((b) => b.id === blockId);
        if (!found) {
          // Override-only block: fall back to a today-only patch.
          const blocks = get()
            .getBlocksForDate(date)
            .map((b) => (b.id === blockId ? { ...b, ...patch } : b));
          await commitOverride(date, blocks);
          emitToast('That block only exists today, so it updated for today only.');
        } else if (scope === 'onwards') {
          await commitTemplate(updateTemplateBlock(template, blockId, patch));
          emitToast('Updated from today onwards.');
        } else {
          await commitTemplate(
            splitTemplateBlockForWeekday(template, blockId, weekday, patch),
          );
          emitToast('Updated for this weekday onwards.');
        }
      }
      notifyAfterChange();
    },

    deleteBlock: async (blockId, date, scope) => {
      pushUndo();
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (scope === 'today') {
        const blocks = get()
          .getBlocksForDate(date)
          .filter((b) => b.id !== blockId);
        await commitOverride(date, blocks);
        emitToast('Deleted for today only.');
      } else {
        const template = await ensureTemplate(date);
        if (scope === 'onwards') {
          await commitTemplate(removeTemplateBlock(template, blockId));
          emitToast('Deleted from today onwards.');
        } else {
          await commitTemplate(
            removeWeekdayFromTemplate(template, blockId, weekday),
          );
          emitToast('Deleted for this weekday onwards.');
        }
        // A today override shadowing the template must not resurrect the block.
        const override = get().dayOverrides[date];
        if (override && override.some((b) => b.id === blockId)) {
          await commitOverride(
            date,
            override.filter((b) => b.id !== blockId),
          );
        }
      }
      await db.deleteCompletion(blockId, date);
      set((s) => ({
        completions: s.completions.filter(
          (c) => !(c.blockId === blockId && c.date === date),
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
      pushUndo();
      const blocks = get().getBlocksForDate(date);
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;
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
      const next: Settings = { ...get().settings, ...patch };
      await db.saveSettings(next);
      set({ settings: next });
      notifyAfterChange();
    },

    undo: async () => {
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
  };
});
