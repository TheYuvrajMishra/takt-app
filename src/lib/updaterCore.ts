// Takt — auto-updater pure helpers (Fix 6). Kept free of native imports
// so vitest can import them without pulling react-native (same split as
// calendar/helpers.ts). The state machine + device flows live in
// updater.ts and re-export these.
export const UPDATER_CHECK_URL =
  'https://github.com/TheYuvrajMishra/takt-app/releases/latest/download/version.json';
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most once per 6h
export const LATER_SUPPRESS_MS = 24 * 60 * 60 * 1000; // "Later" hides it 24h
export const APK_FILE_NAME = 'app-release.apk';
export const UPDATES_DIR_NAME = 'updates';

export interface VersionInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  sha256: string;
  sizeBytes: number;
  notes: string;
  publishedAt: string;
}

/** Strictly validate an unknown JSON payload into a VersionInfo. */
export function parseVersionInfo(raw: unknown): VersionInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.versionCode !== 'number' || !Number.isInteger(r.versionCode) || r.versionCode <= 0) return null;
  if (typeof r.versionName !== 'string' || r.versionName.length === 0) return null;
  if (typeof r.apkUrl !== 'string' || !r.apkUrl.startsWith('https://')) return null;
  if (typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(r.sha256)) return null;
  if (typeof r.sizeBytes !== 'number' || !Number.isInteger(r.sizeBytes) || r.sizeBytes <= 0) return null;
  if (typeof r.notes !== 'string') return null;
  if (typeof r.publishedAt !== 'string' || r.publishedAt.length === 0) return null;
  return {
    versionCode: r.versionCode,
    versionName: r.versionName,
    apkUrl: r.apkUrl,
    sha256: r.sha256.toLowerCase(),
    sizeBytes: r.sizeBytes,
    notes: r.notes,
    publishedAt: r.publishedAt,
  };
}

/** A remote build is newer only when its versionCode is higher. */
export function isNewer(installedCode: number, remote: VersionInfo): boolean {
  return remote.versionCode > installedCode;
}

/** Throttle: automatic checks at most once per 6h; manual checks always run. */
export function shouldCheckNow(now: number, lastCheckAt: number, manual: boolean): boolean {
  if (manual) return true;
  return now - lastCheckAt >= CHECK_INTERVAL_MS;
}

/** "Later" suppresses the sheet for 24h, for that version only. */
export function isSuppressed(
  now: number,
  dismissedVersionCode: number,
  dismissedAt: number,
  remoteCode: number,
): boolean {
  return dismissedVersionCode === remoteCode && now - dismissedAt < LATER_SUPPRESS_MS;
}

/** Human size: 53,186,083 -> "51 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function contentUriFor(packageName: string, fileName: string): string {
  return `content://${packageName}.fileprovider/${UPDATES_DIR_NAME}/${fileName}`;
}
