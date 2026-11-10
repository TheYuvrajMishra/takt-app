// Takt — root layout: gesture handler root, font loading, grain overlay,
// notification handler stub, expo-router Stack.
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useTaktFonts } from '../theme/fonts';
import { GrainOverlay } from '../components/GrainOverlay';
import { LayoutProvider } from '../components/layout';
import { colors } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { initNudges, registerNudgeResponseListener, rescheduleIfPermitted } from '../lib/nudge';
import { UpdateSheet, WhatsNewSheet } from '../components/UpdateSheet';
import { useUpdaterStore } from '../lib/updater';
import { shouldShowOnboarding } from './onboarding';

// Notification handler: this module is the ONE owner of the handler.
// (nudge.ts and onboarding used to set it too, disagreeing on
// shouldPlaySound — visiting onboarding silently re-muted nudges.)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useTaktFonts();
  const router = useRouter();
  const segments = useSegments();
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const load = useStore((s) => s.load);

  useEffect(() => {
    if (fontError) {
      // Fall back to system fonts rather than a blank screen.
      console.warn('Takt fonts failed to load, using system font:', fontError);
    }
  }, [fontError]);

  // Load persisted data, THEN wire the nudge engine: initNudges() plans
  // from the store, so starting it before load() finishes schedules an
  // empty window (a first-launch coin-flip that left zero nudges).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hydrated) await load();
        if (!cancelled) await initNudges();
        // Auto-updater housekeeping (Fix 6): what's-new card + stale-APK
        // cleanup + the throttled launch check. Never blocks launch.
        if (!cancelled) await useUpdaterStore.getState().runLaunchHousekeeping();
      } catch (e) {
        console.warn('Takt init failed', e);
      }
    })();
    const sub = registerNudgeResponseListener((result) => {
      if (result === 'opened') router.replace('/(tabs)');
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belt and braces for the same race: whenever hydration lands, rebuild
  // the nudge window from the real data (idempotent; no-ops when empty).
  useEffect(() => {
    if (hydrated) {
      void rescheduleIfPermitted().catch((e) => {
        console.warn('Takt reschedule failed', e);
      });
    }
  }, [hydrated]);

  // Rolling 48h window maintenance: whenever the app returns to the
  // foreground, rebuild the nudge window. This rolls the window forward
  // after the app sat backgrounded, and re-bases fire times on the current
  // timezone after travel (scheduled DATE triggers are absolute instants).
  // Silent when notifications are not granted.
  // The updater piggybacks the same return: if the user came back from
  // the installer or the system setting, continue the install once;
  // otherwise run the throttled update check.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void rescheduleIfPermitted().catch((e) => {
          console.warn('Takt reschedule failed', e);
        });
        const updater = useUpdaterStore.getState();
        void updater.handleReturnFromInstall().then(() => {
          void updater.checkForUpdates(false).catch(() => undefined);
        });
      }
    });
    return () => sub.remove();
  }, []);

  // Onboarding gate: first run goes to /onboarding, never blocks the app.
  useEffect(() => {
    if (!hydrated) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (shouldShowOnboarding(settings) && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [hydrated, settings, segments, router]);

  if (!fontsLoaded && !fontError) {
    // Blank cloud screen while fonts load (no splash module in this build).
    return <View style={{ flex: 1, backgroundColor: colors.cloud }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.cloud }}>
      <LayoutProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cloud } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="settings" />
        </Stack>
        <UpdateSheet />
        <WhatsNewSheet />
        <GrainOverlay />
      </LayoutProvider>
    </GestureHandlerRootView>
  );
}
