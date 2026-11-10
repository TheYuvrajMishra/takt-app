// Takt — update sheet (Fix 6). One calm sheet for the whole update
// flow: available -> downloading -> ready -> installing, plus error.
// It never interrupts anything: closing it leaves a download running,
// and the Today banner + Settings row always show the pending update.
// The one manual step is Android's own install confirm, said once here.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './TText';
import { Sheet } from './Sheet';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { formatSize, useUpdaterStore } from '../lib/updater';

export function UpdateSheet() {
  const status = useUpdaterStore((s) => s.status);
  const remote = useUpdaterStore((s) => s.remote);
  const progress = useUpdaterStore((s) => s.progress);
  const downloadedBytes = useUpdaterStore((s) => s.downloadedBytes);
  const verifyProgress = useUpdaterStore((s) => s.verifyProgress);
  const error = useUpdaterStore((s) => s.error);
  const sheetOpen = useUpdaterStore((s) => s.sheetOpen);
  const closeSheet = useUpdaterStore((s) => s.closeSheet);
  const downloadUpdate = useUpdaterStore((s) => s.downloadUpdate);
  const cancelDownload = useUpdaterStore((s) => s.cancelDownload);
  const installUpdate = useUpdaterStore((s) => s.installUpdate);
  const dismissUpdate = useUpdaterStore((s) => s.dismissUpdate);
  const checkForUpdates = useUpdaterStore((s) => s.checkForUpdates);
  const openInstallSettings = useUpdaterStore((s) => s.openInstallSettings);

  const title =
    status === 'downloading'
      ? 'Downloading update'
      : status === 'verifying'
        ? 'Verifying update'
        : status === 'ready'
          ? 'Update downloaded'
        : status === 'installing'
          ? 'Installing update'
          : status === 'error'
            ? 'Update didn’t work'
            : status === 'checking'
              ? 'Checking for updates'
              : 'Update ready';

  return (
    <Sheet visible={sheetOpen} onClose={closeSheet} title={title}>
      {remote && status === 'available' ? (
        <View style={styles.body}>
          <Text style={styles.meta}>
            Build {remote.versionCode} · {formatSize(remote.sizeBytes)}
          </Text>
          {remote.notes ? <Text style={styles.notes}>{remote.notes}</Text> : null}
          <Text style={styles.copy}>
            Your phone will ask once to allow installs from Takt — that is Android’s own check, not
            something Takt can skip.
          </Text>
          <Pressable style={styles.primary} onPress={() => void downloadUpdate()}>
            <Text style={styles.primaryText}>Update now</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={() => void dismissUpdate()}>
            <Text style={styles.ghostText}>Later</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'downloading' && remote ? (
        <View style={styles.body}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.meta}>
            {formatSize(downloadedBytes)} of {formatSize(remote.sizeBytes)} · {Math.round(progress * 100)}%
          </Text>
          <Text style={styles.copy}>You can close this sheet — the download keeps going.</Text>
          <Pressable style={styles.ghost} onPress={() => void cancelDownload()}>
            <Text style={styles.ghostText}>Cancel download</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'verifying' && remote ? (
        <View style={styles.body}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(verifyProgress * 100)}%` }]} />
          </View>
          <Text style={styles.meta}>
            Checking the download matches the release · {Math.round(verifyProgress * 100)}%
          </Text>
          <Text style={styles.copy}>This takes a few seconds — the install button appears next.</Text>
          <Pressable style={styles.ghost} onPress={() => void cancelDownload()}>
            <Text style={styles.ghostText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'ready' && remote ? (
        <View style={styles.body}>
          <Text style={styles.copy}>
            Build {remote.versionCode} downloaded and verified — it matches the release exactly.
          </Text>
          <Pressable style={styles.primary} onPress={() => void installUpdate()}>
            <Text style={styles.primaryText}>Install</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={() => void cancelDownload()}>
            <Text style={styles.ghostText}>Delete download</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'installing' ? (
        <View style={styles.body}>
          <Text style={styles.copy}>
            The installer is open. Your phone asks once to allow installs from Takt — tap Allow,
            then come back here and the install continues on its own.
          </Text>
          <Pressable style={styles.ghost} onPress={() => void openInstallSettings()}>
            <Text style={styles.ghostText}>Open install settings</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={closeSheet}>
            <Text style={styles.ghostText}>Back to Takt</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'checking' ? (
        <View style={styles.body}>
          <Text style={styles.copy}>Checking the latest release…</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={styles.body}>
          <Text style={styles.copy}>{error ?? 'Something went wrong.'}</Text>
          <Pressable
            style={styles.primary}
            onPress={() => {
              if (remote) void downloadUpdate();
              else void checkForUpdates(true);
            }}
          >
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={closeSheet}>
            <Text style={styles.ghostText}>Close</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'idle' && !remote ? (
        <View style={styles.body}>
          <Text style={styles.copy}>You’re on the latest build.</Text>
          <Pressable style={styles.ghost} onPress={closeSheet}>
            <Text style={styles.ghostText}>Close</Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, paddingBottom: spacing.sm },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, opacity: 0.7 },
  notes: { fontFamily: fonts.regular, fontSize: 15, color: colors.carbon, lineHeight: 22 },
  copy: { fontFamily: fonts.regular, fontSize: 14, color: colors.carbon, opacity: 0.7, lineHeight: 20 },
  primary: {
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
  ghost: {
    borderRadius: radii.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ghostText: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cloud,
    overflow: 'hidden',
  },
  fill: { height: 6, backgroundColor: colors.carbon, borderRadius: 3 },
});

/** Shown once on the first launch after an update, from the saved notes. */
export function WhatsNewSheet() {
  const whatsNew = useUpdaterStore((s) => s.whatsNew);
  const dismissWhatsNew = useUpdaterStore((s) => s.dismissWhatsNew);
  return (
    <Sheet visible={whatsNew != null} onClose={dismissWhatsNew} title="What’s new">
      <View style={styles.body}>
        <Text style={styles.notes}>{whatsNew ?? ''}</Text>
        <Pressable style={styles.primary} onPress={dismissWhatsNew}>
          <Text style={styles.primaryText}>Got it</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
