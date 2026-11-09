// Takt — root layout: gesture handler root, font loading, grain overlay,
// notification handler stub, expo-router Stack.
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useTaktFonts } from '../theme/fonts';
import { GrainOverlay } from '../components/GrainOverlay';
import { colors } from '../theme/tokens';
import { useStore } from '../store/useStore';
import { initNudges, registerNudgeResponseListener } from '../lib/nudge';
import { shouldShowOnboarding } from './onboarding';

// Notification handler stub: Worker A (nudge engine) owns the real behavior.
// Registered here so the app never crashes on a delivered notification.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
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

  // Load persisted data + wire the nudge engine once.
  useEffect(() => {
    if (!hydrated) void load();
    void initNudges();
    const sub = registerNudgeResponseListener();
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cloud } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="settings" />
      </Stack>
      <GrainOverlay />
    </GestureHandlerRootView>
  );
}
