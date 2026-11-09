// Backup/restore helpers (pure, no React Native deps).
// Old backups (pre-Phase-10-cycle-2) stored the "Do not nudge" defaults as
// top-level fields; newer ones carry them inside `settings`. This folds
// both shapes into one Partial<Settings> for updateSettings.
import type { Settings } from '../types';

export interface LegacyBackup {
  settings?: Partial<Settings>;
  dndDefault?: boolean;
  dndCats?: string[];
}

/**
 * Validate a category-id list from untrusted backup JSON. Returns undefined
 * when there is nothing usable to apply: absent, not an array, or a
 * non-empty array whose ids are all stale (applying that would wipe the
 * current list while claiming success). An explicitly empty array IS
 * applied — that is a real choice, not corruption.
 */
function validCategoryList(
  value: unknown,
  knownCategoryIds: string[],
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter(
    (id): id is string =>
      typeof id === 'string' && knownCategoryIds.includes(id),
  );
  if (value.length > 0 && kept.length === 0) return undefined;
  return kept;
}

export function mergeBackupSettings(
  parsed: LegacyBackup,
  knownCategoryIds: string[],
): Partial<Settings> {
  const restored: Partial<Settings> = { ...(parsed.settings ?? {}) };
  if (typeof parsed.dndDefault === 'boolean') {
    restored.defaultDoNotNudge = parsed.dndDefault;
  }
  if (typeof restored.defaultDoNotNudge !== 'boolean') {
    delete restored.defaultDoNotNudge;
  }
  // New-format settings win; the legacy top-level list is only a fallback
  // for old backups that lack it.
  const fromSettings = validCategoryList(
    parsed.settings?.doNotNudgeCategoryIds,
    knownCategoryIds,
  );
  const fromTop = validCategoryList(parsed.dndCats, knownCategoryIds);
  if (fromSettings !== undefined) {
    restored.doNotNudgeCategoryIds = fromSettings;
  } else if (fromTop !== undefined) {
    restored.doNotNudgeCategoryIds = fromTop;
  } else {
    delete restored.doNotNudgeCategoryIds;
  }
  return restored;
}
