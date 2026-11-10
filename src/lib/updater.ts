// Takt — in-app auto-updater (Fix 6).
//
// How it works: every CI release publishes a `version.json` next to the
// APK (versionCode, versionName, apkUrl, sha256, sizeBytes, notes,
// publishedAt). The app checks that file on launch and on returning to
// the foreground (at most once per 6h, plus a manual check in Settings),
// compares versionCode against the installed build, and — when a newer
// build exists — offers a non-blocking update. Download runs in-app
// (expo-file-system legacy API — the SDK 58 main entry's legacy
// functions throw at runtime), the file is verified by size + SHA-256
// before anything is offered to install, and install goes through
// Android's own package installer (content:// URI via the FileProvider
// from plugins/with-apk-installer.js). The one manual step is Android's
// own "allow installs from Takt" confirm, shown once by the system.
// The downloaded APK is deleted after the app has been replaced (or
// when a download fails verification).
//
// State machine: idle -> checking -> available -> downloading -> verifying
// -> ready -> installing -> (app replaced) ; error returns to idle/available.
// "Later" suppresses the sheet for 24h for that version; Settings
// always shows a pending update. Checks fail silently when offline —
// the user never sees an error for a background check.
import { create } from 'zustand';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import { DEFAULT_UPDATER_PERSISTED, type UpdaterPersisted } from '../types';
import { useStore } from '../store/useStore';
import { base64ToBytes, Sha256 } from './sha256';
import {
  APK_FILE_NAME,
  CHECK_INTERVAL_MS,
  UPDATES_DIR_NAME,
  UPDATER_CHECK_URL,
  contentUriFor,
  isNewer,
  isSuppressed,
  parseVersionInfo,
  shouldCheckNow,
  type VersionInfo,
} from './updaterCore';

export {
  APK_FILE_NAME,
  CHECK_INTERVAL_MS,
  UPDATES_DIR_NAME,
  UPDATER_CHECK_URL,
  contentUriFor,
  isNewer,
  isSuppressed,
  parseVersionInfo,
  shouldCheckNow,
} from './updaterCore';
export type { VersionInfo } from './updaterCore';
export { formatSize } from './updaterCore';

const HASH_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB chunks for the SHA-256 pass
const CHECK_TIMEOUT_MS = 10_000;

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'installing'
  | 'error';

/** The installed build's versionCode (0 when the native value is missing). */
export function installedVersionCode(): number {
  const raw = Application.nativeBuildVersion;
  const n = raw == null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function apkLocalUri(): string | null {
  const cache = FileSystem.cacheDirectory;
  if (!cache) return null;
  return `${cache}${UPDATES_DIR_NAME}/${APK_FILE_NAME}`;
}

function persisted(): UpdaterPersisted {
  return useStore.getState().settings.updater ?? DEFAULT_UPDATER_PERSISTED;
}

async function savePersisted(patch: Partial<UpdaterPersisted>): Promise<void> {
  const next = { ...persisted(), ...patch };
  await useStore.getState().updateSettings({ updater: next });
}

async function sha256File(
  uri: string,
  sizeBytes: number,
  onProgress?: (fraction: number) => void,
  isCancelled?: () => boolean,
): Promise<string> {
  const hash = new Sha256();
  let offset = 0;
  while (offset < sizeBytes) {
    if (isCancelled?.()) throw new Error('cancelled');
    const len = Math.min(HASH_CHUNK_BYTES, sizeBytes - offset);
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length: len,
    });
    hash.update(base64ToBytes(b64));
    offset += len;
    onProgress?.(offset / sizeBytes);
  }
  return Array.from(hash.digest())
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deleteApkFile(): Promise<void> {
  const uri = apkLocalUri();
  if (!uri) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // A leftover file is harmless — the next download overwrites it.
  }
}

interface UpdaterState {
  status: UpdaterStatus;
  remote: VersionInfo | null;
  progress: number; // 0..1 while downloading
  downloadedBytes: number;
  /** 0..1 while verifying (hashing the download). */
  verifyProgress: number;
  error: string | null;
  sheetOpen: boolean;
  /** "What's new" notes, shown once on the first launch after an update. */
  whatsNew: string | null;
  /** Re-launch the installer at most once after returning from it. */
  installRelaunched: boolean;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  downloadUpdate: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  /** Called when the app returns to the foreground while installing. */
  handleReturnFromInstall: () => Promise<void>;
  dismissUpdate: () => Promise<void>;
  openSheet: () => void;
  closeSheet: () => void;
  dismissWhatsNew: () => void;
  /** First-launch housekeeping: what's-new, stale-APK cleanup, auto check. */
  runLaunchHousekeeping: () => Promise<void>;
  /** Deep-link to this app's "install unknown apps" system setting. */
  openInstallSettings: () => Promise<void>;
}

export const useUpdaterStore = create<UpdaterState>()((set, get) => {
  let downloadTask: { cancelAsync: () => Promise<void> } | null = null;
  // Bumped when a verification is cancelled: the hashing loop checks it
  // between chunks and aborts instead of finishing into 'ready'.
  let verifyGen = 0;

  /** Hand the verified APK to Android's package installer. */
  async function launchInstaller(): Promise<void> {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUriFor('com.takt.app', APK_FILE_NAME),
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
    } catch {
      set({
        status: 'error',
        error: "Couldn't open the installer — try again, or open your phone's install settings from the update sheet.",
      });
    }
  }

  return {
    status: 'idle',
    remote: null,
    progress: 0,
    downloadedBytes: 0,
    verifyProgress: 0,
    error: null,
    sheetOpen: false,
    whatsNew: null,
    installRelaunched: false,

    checkForUpdates: async (manual = false) => {
      const { status } = get();
      if (status === 'downloading' || status === 'verifying' || status === 'installing') return;
      const now = Date.now();
      const p = persisted();
      if (!shouldCheckNow(now, p.lastCheckAt, manual)) return;
      set({ status: 'checking', error: null });
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch(UPDATER_CHECK_URL, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const info = parseVersionInfo(await res.json());
        await savePersisted({ lastCheckAt: now });
        if (!info) {
          // Bad payload: treat like no update (silent for auto checks).
          set({ status: 'idle', error: manual ? 'The update check returned something unexpected — try again later.' : null });
          return;
        }
        const installed = installedVersionCode();
        if (!isNewer(installed, info)) {
          set({ status: 'idle', remote: null });
          return;
        }
        // Keep the notes: the "What's new" card after the update reads
        // them from here (the new build has no memory of this check).
        await savePersisted({ lastNotes: info.notes });
        const suppressed = isSuppressed(now, p.dismissedVersionCode, p.dismissedAt, info.versionCode);
        set({ status: 'available', remote: info, error: null, sheetOpen: !suppressed });
      } catch {
        // Offline or server hiccup: silent for auto checks, plain words for manual.
        set({
          status: 'idle',
          error: manual ? "Couldn't reach the update server — check your connection and try again." : null,
        });
      }
    },

    downloadUpdate: async () => {
      const { remote, status } = get();
      if (!remote || (status !== 'available' && status !== 'error')) return;
      const uri = apkLocalUri();
      if (!uri) {
        set({ status: 'error', error: 'No storage available for the download.' });
        return;
      }
      set({ status: 'downloading', progress: 0, downloadedBytes: 0, verifyProgress: 0, error: null });
      try {
        const dir = uri.slice(0, uri.lastIndexOf('/'));
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const task = FileSystem.createDownloadResumable(
          remote.apkUrl,
          uri,
          {},
          (progress) => {
            const total = progress.totalBytesExpectedToWrite;
            set({
              downloadedBytes: progress.totalBytesWritten,
              progress: total > 0 ? progress.totalBytesWritten / total : 0,
            });
          },
        );
        downloadTask = task;
        const result = await task.downloadAsync();
        downloadTask = null;
        if (!result || result.status !== 200) {
          throw new Error(`Download failed (HTTP ${result?.status ?? '?'})`);
        }
        // Verify before offering anything to install: size, then SHA-256.
        // This is the slow part on a phone (pure-JS hash of a 53 MB file),
        // so it gets its own status + progress instead of sitting on a
        // frozen 100% download bar — that is what looked "stuck".
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || (info.size != null && info.size !== remote.sizeBytes)) {
          throw new Error('size mismatch');
        }
        const actualSize = info.size ?? remote.sizeBytes;
        const gen = verifyGen;
        set({ status: 'verifying', verifyProgress: 0 });
        const hash = await sha256File(
          uri,
          actualSize,
          (fraction) => set({ verifyProgress: fraction }),
          () => gen !== verifyGen,
        );
        if (hash !== remote.sha256) {
          throw new Error('hash mismatch');
        }
        await savePersisted({ downloadedVersionCode: remote.versionCode });
        set({ status: 'ready', progress: 1, verifyProgress: 1 });
      } catch (e) {
        downloadTask = null;
        await deleteApkFile();
        if (e instanceof Error && e.message === 'cancelled') {
          set({ status: 'available', progress: 0, downloadedBytes: 0, verifyProgress: 0 });
          return;
        }
        const msg =
          e instanceof Error && (e.message === 'size mismatch' || e.message === 'hash mismatch')
            ? "The download didn't match the release — try again."
            : 'The download was interrupted — try again when you have a connection.';
        set({ status: 'error', error: msg, progress: 0, downloadedBytes: 0, verifyProgress: 0 });
      }
    },

    cancelDownload: async () => {
      if (downloadTask) {
        try {
          await downloadTask.cancelAsync();
        } catch {
          // Already finished or already cancelled.
        }
        downloadTask = null;
      }
      // Abort a verification in progress: the hashing loop checks this
      // between chunks and stops instead of finishing into 'ready'.
      verifyGen += 1;
      await deleteApkFile();
      set((s) => ({ status: s.remote ? 'available' : 'idle', progress: 0, downloadedBytes: 0, verifyProgress: 0 }));
    },

    installUpdate: async () => {
      const { remote, status } = get();
      if (!remote || (status !== 'ready' && status !== 'available' && status !== 'error')) return;
      const uri = apkLocalUri();
      if (!uri) {
        set({ status: 'error', error: 'No downloaded update to install.' });
        return;
      }
      // Only a download verified in a previous session may be installed
      // without re-downloading: a partial file from a killed download
      // must never reach the installer.
      const verified = status === 'ready' || persisted().downloadedVersionCode === remote.versionCode;
      if (!verified) {
        set({ status: 'available', error: 'The update needs to be downloaded first.' });
        return;
      }
      set({ status: 'installing', error: null, installRelaunched: false });
      await launchInstaller();
    },

    handleReturnFromInstall: async () => {
      const { status, installRelaunched } = get();
      if (status !== 'installing') return;
      // The user came back without the app being replaced. If they went
      // to the system setting and allowed installs from Takt, the
      // installer now works — continue automatically, once.
      if (!installRelaunched) {
        set({ installRelaunched: true });
        await launchInstaller();
        return;
      }
      // Second return: leave the verified download ready to install.
      set({ status: 'ready' });
    },

    dismissUpdate: async () => {
      const { remote } = get();
      if (remote) {
        await savePersisted({ dismissedVersionCode: remote.versionCode, dismissedAt: Date.now() });
      }
      set({ sheetOpen: false });
    },

    openSheet: () => set({ sheetOpen: true }),
    closeSheet: () => set({ sheetOpen: false }),
    dismissWhatsNew: () => set({ whatsNew: null }),

    runLaunchHousekeeping: async () => {
      const installed = installedVersionCode();
      const p = persisted();
      try {
        // First launch on a newer build than the last one seen: show
        // "What's new" once (from the release notes we saved when the
        // update was offered) and rebuild the nudge window — an update
        // replaces the app, which can drop scheduled notifications.
        if (installed > 0 && p.lastSeenVersionCode > 0 && installed > p.lastSeenVersionCode) {
          if (p.lastNotes) set({ whatsNew: p.lastNotes });
          const { rescheduleIfPermitted } = await import('./nudge');
          await rescheduleIfPermitted().catch(() => undefined);
        }
        if (installed > 0 && installed !== p.lastSeenVersionCode) {
          await savePersisted({ lastSeenVersionCode: installed });
        }
        // The downloaded APK is gone once the app it belongs to is
        // installed (the update replaces the app, so a leftover file
        // from an older build is dead weight).
        if (
          installed > 0 &&
          p.downloadedVersionCode > 0 &&
          installed >= p.downloadedVersionCode
        ) {
          await deleteApkFile();
          await savePersisted({ downloadedVersionCode: 0 });
        }
      } catch {
        // Housekeeping must never block launch.
      }
      await get().checkForUpdates(false);
    },

    openInstallSettings: async () => {
      try {
        await IntentLauncher.startActivityAsync(
          'android.settings.MANAGE_UNKNOWN_APP_SOURCES',
          { data: 'package:com.takt.app' },
        );
      } catch {
        // Older Android versions route this differently; the installer
        // itself offers the setting when the permission is missing.
        set({ error: "Couldn't open that setting — the installer will offer it when you tap Install." });
      }
    },
  };
});
