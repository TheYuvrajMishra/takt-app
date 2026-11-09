// Takt — sqlite persistence (expo-sqlite SDK 58, async API).
// Tables: categories, templates, day_overrides, completions, settings.
// Single database file: takt.db. All JSON columns are stored as strings.
import * as SQLite from 'expo-sqlite';
import type {
  Category,
  CompletionEntry,
  DayOverride,
  RoutineTemplate,
  Settings,
} from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../types';

const DATABASE_NAME = 'takt.db';
const SETTINGS_KEY = 'app';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  return dbPromise;
}

/** Collision-resistant id without a crypto dependency (works in Hermes + node). */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  subcategories TEXT NOT NULL DEFAULT '[]',
  usage_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  blocks TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS day_overrides (
  date TEXT PRIMARY KEY NOT NULL,
  blocks TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS completions (
  block_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  done_at TEXT,
  on_time INTEGER NOT NULL DEFAULT 0,
  nudges_fired INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  PRIMARY KEY (block_id, date)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

function categoryFromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color as Category['color'],
    icon: row.icon,
    subcategories: JSON.parse(row.subcategories) as Category['subcategories'],
    usageCount: row.usage_count,
  };
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  subcategories: string;
  usage_count: number;
  sort_order: number;
}

interface TemplateRow {
  id: string;
  name: string;
  effective_from: string;
  blocks: string;
}

interface OverrideRow {
  date: string;
  blocks: string;
}

interface CompletionRow {
  block_id: string;
  date: string;
  status: string;
  done_at: string | null;
  on_time: number;
  nudges_fired: number;
  started_at: string | null;
}

function completionFromRow(row: CompletionRow): CompletionEntry {
  return {
    blockId: row.block_id,
    date: row.date,
    status: row.status as CompletionEntry['status'],
    doneAt: row.done_at ?? undefined,
    onTime: row.on_time === 1,
    nudgesFired: row.nudges_fired,
    startedAt: row.started_at ?? undefined,
  };
}

/** Create tables and seed default categories + settings on first run. Idempotent. */
export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync(SCHEMA);
  const count = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM categories',
  );
  if ((count?.n ?? 0) === 0) {
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
        const c = DEFAULT_CATEGORIES[i];
        await db.runAsync(
          'INSERT INTO categories (id, name, color, icon, subcategories, usage_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
          c.id,
          c.name,
          c.color,
          c.icon,
          JSON.stringify(c.subcategories ?? []),
          c.usageCount ?? 0,
          i,
        );
      }
    });
  }
  const settingsRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    SETTINGS_KEY,
  );
  if (!settingsRow) {
    await db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?)',
      SETTINGS_KEY,
      JSON.stringify(DEFAULT_SETTINGS),
    );
  }
}

// --- Categories ---

export async function getCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories ORDER BY sort_order ASC, name ASC',
  );
  return rows.map(categoryFromRow);
}

export async function saveCategory(category: Category, sortOrder?: number): Promise<void> {
  const db = await getDb();
  const order =
    sortOrder ??
    (await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM categories',
    ))?.n ??
    0;
  await db.runAsync(
    `INSERT INTO categories (id, name, color, icon, subcategories, usage_count, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, color = excluded.color, icon = excluded.icon,
       subcategories = excluded.subcategories, usage_count = excluded.usage_count,
       sort_order = excluded.sort_order`,
    category.id,
    category.name,
    category.color,
    category.icon,
    JSON.stringify(category.subcategories ?? []),
    category.usageCount ?? 0,
    order,
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
}

export async function reorderCategories(idsInOrder: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < idsInOrder.length; i++) {
      await db.runAsync(
        'UPDATE categories SET sort_order = ? WHERE id = ?',
        i,
        idsInOrder[i],
      );
    }
  });
}

export async function replaceCategories(categories: Category[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM categories');
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      await db.runAsync(
        'INSERT INTO categories (id, name, color, icon, subcategories, usage_count, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        c.id,
        c.name,
        c.color,
        c.icon,
        JSON.stringify(c.subcategories ?? []),
        c.usageCount ?? 0,
        i,
      );
    }
  });
}

// --- Templates ---

export async function getTemplates(): Promise<RoutineTemplate[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TemplateRow>(
    'SELECT * FROM templates ORDER BY effective_from ASC',
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    effectiveFrom: r.effective_from,
    blocks: JSON.parse(r.blocks) as RoutineTemplate['blocks'],
  }));
}

export async function getTemplate(id: string): Promise<RoutineTemplate | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TemplateRow>(
    'SELECT * FROM templates WHERE id = ?',
    id,
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    effectiveFrom: row.effective_from,
    blocks: JSON.parse(row.blocks) as RoutineTemplate['blocks'],
  };
}

export async function saveTemplate(template: RoutineTemplate): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO templates (id, name, effective_from, blocks) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, effective_from = excluded.effective_from, blocks = excluded.blocks`,
    template.id,
    template.name,
    template.effectiveFrom,
    JSON.stringify(template.blocks),
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM templates WHERE id = ?', id);
}

export async function replaceTemplates(templates: RoutineTemplate[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM templates');
    for (const t of templates) {
      await db.runAsync(
        'INSERT INTO templates (id, name, effective_from, blocks) VALUES (?, ?, ?, ?)',
        t.id,
        t.name,
        t.effectiveFrom,
        JSON.stringify(t.blocks),
      );
    }
  });
}

// --- Day overrides ---

export async function getDayOverride(date: string): Promise<DayOverride | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<OverrideRow>(
    'SELECT * FROM day_overrides WHERE date = ?',
    date,
  );
  if (!row) return null;
  return { date: row.date, blocks: JSON.parse(row.blocks) as DayOverride['blocks'] };
}

export async function getDayOverrides(from: string, to: string): Promise<DayOverride[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OverrideRow>(
    'SELECT * FROM day_overrides WHERE date >= ? AND date <= ? ORDER BY date ASC',
    from,
    to,
  );
  return rows.map((r) => ({
    date: r.date,
    blocks: JSON.parse(r.blocks) as DayOverride['blocks'],
  }));
}

export async function getAllDayOverrides(): Promise<DayOverride[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OverrideRow>(
    'SELECT * FROM day_overrides ORDER BY date ASC',
  );
  return rows.map((r) => ({
    date: r.date,
    blocks: JSON.parse(r.blocks) as DayOverride['blocks'],
  }));
}

export async function saveDayOverride(override: DayOverride): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO day_overrides (date, blocks) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET blocks = excluded.blocks`,
    override.date,
    JSON.stringify(override.blocks),
  );
}

export async function deleteDayOverride(date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM day_overrides WHERE date = ?', date);
}

export async function replaceDayOverrides(
  overrides: Record<string, DayOverride['blocks']>,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM day_overrides');
    for (const [date, blocks] of Object.entries(overrides)) {
      await db.runAsync(
        'INSERT INTO day_overrides (date, blocks) VALUES (?, ?)',
        date,
        JSON.stringify(blocks),
      );
    }
  });
}

// --- Completions ---

export async function getCompletionsForDate(date: string): Promise<CompletionEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CompletionRow>(
    'SELECT * FROM completions WHERE date = ?',
    date,
  );
  return rows.map(completionFromRow);
}

export async function getCompletionsInRange(
  from: string,
  to: string,
): Promise<CompletionEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CompletionRow>(
    'SELECT * FROM completions WHERE date >= ? AND date <= ? ORDER BY date ASC',
    from,
    to,
  );
  return rows.map(completionFromRow);
}

export async function getAllCompletions(): Promise<CompletionEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CompletionRow>(
    'SELECT * FROM completions ORDER BY date ASC',
  );
  return rows.map(completionFromRow);
}

export async function saveCompletion(entry: CompletionEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO completions (block_id, date, status, done_at, on_time, nudges_fired, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(block_id, date) DO UPDATE SET
       status = excluded.status, done_at = excluded.done_at, on_time = excluded.on_time,
       nudges_fired = excluded.nudges_fired, started_at = excluded.started_at`,
    entry.blockId,
    entry.date,
    entry.status,
    entry.doneAt ?? null,
    entry.onTime ? 1 : 0,
    entry.nudgesFired ?? 0,
    entry.startedAt ?? null,
  );
}

export async function deleteCompletion(blockId: string, date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM completions WHERE block_id = ? AND date = ?',
    blockId,
    date,
  );
}

export async function replaceCompletions(entries: CompletionEntry[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM completions');
    for (const e of entries) {
      await db.runAsync(
        'INSERT INTO completions (block_id, date, status, done_at, on_time, nudges_fired, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        e.blockId,
        e.date,
        e.status,
        e.doneAt ?? null,
        e.onTime ? 1 : 0,
        e.nudgesFired ?? 0,
        e.startedAt ?? null,
      );
    }
  });
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    SETTINGS_KEY,
  );
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<Settings>) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY,
    JSON.stringify(settings),
  );
}

/** Wipe everything (dev / sign-out helper). Re-seeds on next initDb. */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM categories');
    await db.runAsync('DELETE FROM templates');
    await db.runAsync('DELETE FROM day_overrides');
    await db.runAsync('DELETE FROM completions');
    await db.runAsync('DELETE FROM settings');
  });
}
