import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ScrollScreen } from '../components/layout';
import { Text, TextInput } from '../components/TText';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { colors, fonts, hairline, radii, spacing, tracking, categoryColorHex } from '../theme/tokens';
import { DEFAULT_CATEGORIES, type Category, type Settings } from '../types';
import { dateKey, minToTime } from '../lib/core';
import { CategoryIcon } from '../components/CategoryIcon';
import { useStore } from '../store/useStore';
import { requestNudgePermissions, rescheduleIfPermitted, testNudgeNow } from '../lib/nudge';

// On finish, `settings.onboardingDone` is persisted through the store and
// the root layout's onboarding gate stops redirecting here.
// Step 3 (category picks) is still local state: there is no store field
// for the picked-category set. Step 6 schedules a real block.

export function shouldShowOnboarding(settings: Settings): boolean {
  return !settings.onboardingDone;
}

const TOTAL_STEPS = 6;

const TL_START = 7 * 60;
const TL_END = 21 * 60;

export default function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const updateSettings = useStore((s) => s.updateSettings);
  const addBlock = useStore((s) => s.addBlock);
  const savedName = useStore((s) => s.settings.userName);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  // Step 1 — the user's name, so Takt can greet them by it.
  const [name, setName] = useState(savedName ?? '');

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== (savedName ?? '')) {
      void updateSettings({ userName: trimmed });
    }
  };

  const goNext = () => {
    if (step === 1) saveName();
    if (step === TOTAL_STEPS) finish();
    else setStep((s) => s + 1);
  };

  // Step 2
  const [notifStatus, setNotifStatus] = useState<string>('not asked');

  // Step 3
  const [cats, setCats] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [pickedCats, setPickedCats] = useState<string[]>(DEFAULT_CATEGORIES.map((c) => c.id));
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Step 4
  const [nudgeSent, setNudgeSent] = useState(false);
  const [demoDone, setDemoDone] = useState(false);

  // Step 6
  const [firstTaskCat, setFirstTaskCat] = useState('cat-learning');
  const [firstTaskStart, setFirstTaskStart] = useState(9 * 60);
  const [firstTaskScheduled, setFirstTaskScheduled] = useState(false);

  // NOTE: the notification handler is owned by the root layout only; this
  // screen used to set its own (sound off), silently re-muting nudges.

  const finish = () => {
    setDone(true);
    void updateSettings({ onboardingDone: true });
    onDone?.();
    try {
      router.replace('/(tabs)');
    } catch {
      // No tabs route mounted yet — the parent layout wires this up.
    }
  };

  const skip = () => finish();

  const requestNotifications = async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') {
      setNotifStatus('granted');
      return;
    }
    if (current.status === 'denied') {
      // Re-requesting after a denial is a no-op on Android; send the user
      // to system settings instead, like the Exact-alarms / Battery cards.
      Linking.openSettings();
      return;
    }
    const granted = await requestNudgePermissions();
    setNotifStatus(granted ? 'granted' : 'denied');
    // The root layout's initNudges() only schedules when already granted,
    // so granting here must schedule the window now — otherwise zero
    // nudges fire until the next store mutation or foreground event.
    if (granted) {
      try {
        await rescheduleIfPermitted();
      } catch (e) {
        console.warn('Takt reschedule failed', e);
      }
    }
  };

  const sendTestNudge = async () => {
    try {
      // The real test nudge: alarm sound + Done/Start actions, through
      // the nudge channel. (An inline schedule without a channel used to
      // fire silently on the default channel, so it proved nothing.)
      await testNudgeNow('Morning run');
      setNudgeSent(true);
    } catch {
      // A failed schedule used to report success anyway; stay honest so the
      // user retries instead of trusting a nudge that never fired.
      setNudgeSent(false);
    }
  };

  if (done) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>
          You are all set{name.trim() ? `, ${name.trim()}` : ''}.
        </Text>
        <Text style={styles.body}>Your day is ready to be nudged into shape.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Progress */}
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i < step && styles.dotActive]} />
          ))}
        </View>
        <Pressable onPress={skip} accessibilityLabel="Skip onboarding">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>
      <Text style={styles.stepLabel}>
        Step {step} of {TOTAL_STEPS}
      </Text>

      <ScrollScreen chrome="none" contentContainerStyle={styles.content}>
        {step === 1 && (
          <>
            <Text style={styles.title}>Your day, nudged into shape</Text>
            <Text style={styles.body}>
              Takt keeps your routine on a timeline and nudges you until the thing is done. No
              shouting, no streak-shaming — just a steady tap on the shoulder.
            </Text>
            <Text style={styles.nameLabel}>What should Takt call you?</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="rgba(10,10,10,0.4)"
              style={styles.nameInput}
              returnKeyType="done"
              onSubmitEditing={goNext}
              autoCapitalize="words"
            />
            <View style={styles.butterCard}>
              <Text style={styles.butterText}>
                Plan the day once. Takt handles the remembering.
              </Text>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>A few permissions</Text>
            <Text style={styles.body}>
              Nudges only work if Takt can reach you. Nothing here blocks you — you can skip
              any of these and turn them on later.
            </Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notifications</Text>
              <Text style={styles.cardBody}>So nudges can appear on your lock screen.</Text>
              <Pressable style={styles.smallButton} onPress={requestNotifications}>
                <Text style={styles.smallButtonText}>
                  {notifStatus === 'granted' ? 'Notifications on' : 'Allow notifications'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Exact alarms</Text>
              <Text style={styles.cardBody}>So a nudge fires at the minute it should, not late.</Text>
              <Pressable style={styles.smallButton} onPress={() => Linking.openSettings()}>
                <Text style={styles.smallButtonText}>Open settings</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Battery exemption</Text>
              <Text style={styles.cardBody}>
                So Android does not silence Takt in the background.
              </Text>
              <Pressable style={styles.smallButton} onPress={() => Linking.openSettings()}>
                <Text style={styles.smallButtonText}>Open settings</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Pick your categories</Text>
            <Text style={styles.body}>
              These are pre-selected for you. Tap to add or remove, tap a name to rename it.
            </Text>
            {cats.map((cat, idx) => {
              const picked = pickedCats.includes(cat.id);
              return (
                <Animated.View
                  key={cat.id}
                  entering={FadeInUp.delay(idx * 40).duration(220)}
                  style={[styles.card, styles.catRow]}
                >
                  <Pressable
                    onPress={() =>
                      setPickedCats((prev) =>
                        prev.includes(cat.id) ? prev.filter((c) => c !== cat.id) : [...prev, cat.id],
                      )
                    }
                    style={[styles.check, picked && styles.checkOn]}
                    accessibilityLabel={`Toggle ${cat.name}`}
                  >
                    {picked ? <Text style={styles.checkMark}>✓</Text> : null}
                  </Pressable>
                  <CategoryIcon icon={cat.icon} color={cat.color} size={28} />
                  {renamingId === cat.id ? (
                    <TextInput
                      value={cat.name}
                      onChangeText={(v) =>
                        setCats((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name: v } : c)))
                      }
                      onBlur={() => setRenamingId(null)}
                      onSubmitEditing={() => setRenamingId(null)}
                      style={styles.renameInput}
                      autoFocus
                    />
                  ) : (
                    <Pressable onPress={() => setRenamingId(cat.id)}>
                      <Text style={styles.catName}>{cat.name}</Text>
                    </Pressable>
                  )}
                </Animated.View>
              );
            })}
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>Meet the nudge</Text>
            <Text style={styles.body}>
              When a block starts and you have not marked it done, Takt taps you — every few
              minutes, until you do. Try one now.
            </Text>
            <View style={styles.nudgeCard}>
              <Text style={styles.nudgeTitle}>Morning run starts now</Text>
              <Text style={styles.nudgeBody}>Tap Done when you finish — that is the whole interaction.</Text>
              <Pressable
                style={[styles.smallButton, demoDone && styles.smallButtonDone]}
                onPress={() => setDemoDone(true)}
              >
                <Text style={styles.smallButtonText}>{demoDone ? 'Marked done' : 'Mark done'}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={sendTestNudge}>
              <Text style={styles.secondaryButtonText}>
                {nudgeSent ? 'Test nudge sent — check your notifications' : 'Send a real test nudge'}
              </Text>
            </Pressable>
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.title}>Where things live</Text>
            <Text style={styles.body}>
              Three tabs, one job each. Here is what they look like — and
              where a task gets created.
            </Text>

            <MockupPhone caption="Today — create from the dock">
              <View style={styles.mockHero}>
                <Text style={styles.mockHeroTitle}>Discipline so far</Text>
                <Text style={styles.mockHeroScore}>2 h 10 min of 5 h 30 min</Text>
                <View style={styles.mockBar}>
                  <View style={[styles.mockSeg, { flex: 2, backgroundColor: categoryColorHex.mint }]} />
                  <View style={[styles.mockSeg, { flex: 1, backgroundColor: categoryColorHex.apricot }]} />
                </View>
              </View>
              <View style={styles.mockTask}>
                <Text style={styles.mockTaskTitle}>Morning run</Text>
                <Text style={styles.mockTaskTime}>7:00 · 30 min</Text>
              </View>
              <View style={styles.mockDock}>
                <View style={[styles.mockDockDot, { backgroundColor: categoryColorHex.mint }]} />
                <View style={[styles.mockDockDot, { backgroundColor: categoryColorHex.apricot }]} />
                <View style={[styles.mockDockDot, { backgroundColor: categoryColorHex.violet }]} />
                <Text style={styles.mockDockText}>Hold a category, drag it onto your day</Text>
              </View>
            </MockupPhone>

            <MockupPhone caption="Calendar — plan ahead, drag between days">
              <View style={styles.mockCal}>
                {[
                  { t: '7:00', c: categoryColorHex.mint, h: 34 },
                  { t: '8:00', c: categoryColorHex.apricot, h: 26 },
                  { t: '9:30', c: categoryColorHex.violet, h: 44 },
                ].map((b) => (
                  <View key={b.t} style={styles.mockCalRow}>
                    <Text style={styles.mockCalTime}>{b.t}</Text>
                    <View style={[styles.mockCalBlock, { height: b.h, backgroundColor: b.c }]} />
                  </View>
                ))}
              </View>
            </MockupPhone>

            <MockupPhone caption="Stats — your discipline, as a heatmap">
              <View style={styles.mockHeat}>
                {Array.from({ length: 28 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.mockHeatCell,
                      { opacity: 0.15 + ((i * 37) % 10) / 10 },
                    ]}
                  />
                ))}
              </View>
            </MockupPhone>
          </>
        )}

        {step === 6 && (
          <>
            <Text style={styles.title}>One last thing</Text>
            <Text style={styles.body}>
              Schedule your first real task and you are off. Pick a category and a start time.
            </Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>First task</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.firstTaskCats}>
                {cats.slice(0, 6).map((cat) => {
                  const active = firstTaskCat === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setFirstTaskCat(cat.id)}
                      style={[styles.firstTaskChip, active && styles.firstTaskChipActive]}
                    >
                      <CategoryIcon icon={cat.icon} color={cat.color} size={20} />
                      <Text style={[styles.firstTaskChipText, active && styles.firstTaskChipTextActive]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.controlsRow}>
                <Pressable style={styles.smallButton} onPress={() => setFirstTaskStart((t) => Math.max(TL_START, t - 15))}>
                  <Text style={styles.smallButtonText}>Earlier</Text>
                </Pressable>
                <Text style={styles.firstTaskTime}>{minToTime(firstTaskStart)}</Text>
                <Pressable style={styles.smallButton} onPress={() => setFirstTaskStart((t) => Math.min(TL_END - 30, t + 15))}>
                  <Text style={styles.smallButtonText}>Later</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  // Real block, tomorrow only: a one-off first task, not a
                  // recurring template block.
                  const cat = cats.find((c) => c.id === firstTaskCat);
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  void addBlock(
                    {
                      categoryId: firstTaskCat,
                      title: cat?.name ?? 'First task',
                      startMin: firstTaskStart,
                      durationMin: 30,
                      // The first task is the "Meet the nudge" demo: it
                      // always nudges, whatever the Do-not-nudge defaults say.
                      doNotNudge: false,
                    },
                    dateKey(tomorrow),
                    'today',
                  );
                  setFirstTaskScheduled(true);
                }}
              >
                <Text style={styles.primaryButtonText}>
                  {firstTaskScheduled ? 'Scheduled' : 'Schedule my first task'}
                </Text>
              </Pressable>
              {firstTaskScheduled ? (
                <Text style={styles.scheduledNote}>
                  {cats.find((c) => c.id === firstTaskCat)?.name} at {minToTime(firstTaskStart)} tomorrow — see you
                  there.
                </Text>
              ) : null}
            </View>
          </>
        )}
      </ScrollScreen>

      <View style={styles.footer}>
        {step > 1 ? (
          <Pressable style={styles.backButton} onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Pressable style={styles.primaryButton} onPress={goNext}>
          <Text style={styles.primaryButtonText}>{step === TOTAL_STEPS ? 'Start using Takt' : 'Continue'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A static phone-frame mockup of an app screen, for onboarding. */
function MockupPhone({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <View style={styles.mockup}>
      <View style={styles.mockupPhone}>
        <View style={styles.mockupNotch} />
        {children}
      </View>
      <Text style={styles.mockupCaption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud, paddingTop: spacing.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(10,10,10,0.15)' },
  dotActive: { backgroundColor: colors.carbon },
  skip: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  stepLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon, opacity: 0.55, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 38, color: colors.carbon, marginBottom: spacing.sm, letterSpacing: tracking.tight },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: colors.carbon, opacity: 0.75, marginBottom: spacing.md },
  butterCard: { backgroundColor: colors.butter, borderRadius: radii.card, padding: spacing.lg },
  butterText: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26, color: colors.carbon },
  card: { backgroundColor: colors.paper, borderRadius: radii.cardSm, padding: spacing.md, marginBottom: spacing.sm },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.carbon },
  cardBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.carbon, opacity: 0.75, marginTop: 4, marginBottom: spacing.sm },
  smallButton: { backgroundColor: colors.carbon, borderRadius: radii.pill, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  smallButtonDone: { backgroundColor: colors.mint },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.paper },
  secondaryButton: { backgroundColor: colors.paper, borderRadius: radii.pill, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: hairline },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 26, height: 26, borderRadius: 999, borderWidth: 1.5, borderColor: colors.carbon, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.carbon },
  checkMark: { color: colors.paper, fontSize: 14, fontWeight: '700' },
  catName: { fontFamily: fonts.medium, fontSize: 16, color: colors.carbon },
  renameInput: { fontFamily: fonts.medium, fontSize: 16, color: colors.carbon, borderBottomWidth: 1, borderBottomColor: hairline, paddingVertical: 2, minWidth: 140 },
  controlsRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  nudgeCard: { backgroundColor: colors.butter, borderRadius: radii.card, padding: spacing.lg, marginBottom: spacing.md },
  nudgeTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.carbon },
  nudgeBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.carbon, opacity: 0.75, marginVertical: spacing.sm },
  firstTaskCats: { marginVertical: spacing.sm },
  firstTaskChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: hairline, backgroundColor: colors.paper, borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
  firstTaskChipActive: { backgroundColor: colors.carbon, borderColor: colors.carbon },
  firstTaskChipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  firstTaskChipTextActive: { color: colors.paper },
  firstTaskTime: { fontFamily: fonts.semibold, fontSize: 20, color: colors.carbon, flex: 1, textAlign: 'center' },
  scheduledNote: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, marginTop: spacing.sm, textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  backButton: { paddingVertical: 14, paddingHorizontal: 8, minWidth: 56 },
  backButtonText: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  primaryButton: { flex: 1, backgroundColor: colors.carbon, borderRadius: radii.pill, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
  nameLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon, marginBottom: 8 },
  nameInput: {
    backgroundColor: colors.paper,
    borderRadius: radii.cardSm,
    borderWidth: 1,
    borderColor: hairline,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.carbon,
    marginBottom: spacing.md,
  },
  mockup: { marginBottom: spacing.lg, alignItems: 'center' },
  mockupPhone: {
    width: 240,
    backgroundColor: colors.paper,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.carbon,
    padding: 14,
    paddingTop: 22,
    gap: 10,
  },
  mockupNotch: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 64,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.carbon,
    opacity: 0.85,
  },
  mockupCaption: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, marginTop: 10, textAlign: 'center' },
  mockHero: { backgroundColor: colors.butter, borderRadius: 16, padding: 12 },
  mockHeroTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  mockHeroScore: { fontFamily: fonts.medium, fontSize: 12, color: colors.carbon, opacity: 0.7, marginTop: 2, marginBottom: 8 },
  mockBar: { flexDirection: 'row', height: 18, backgroundColor: colors.paper, borderRadius: 9, overflow: 'hidden' },
  mockSeg: { height: '100%' },
  mockTask: { backgroundColor: colors.cloud, borderRadius: 12, padding: 10 },
  mockTaskTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.carbon },
  mockTaskTime: { fontFamily: fonts.medium, fontSize: 12, color: colors.carbon, opacity: 0.6 },
  mockDock: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.carbon, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  mockDockDot: { width: 14, height: 14, borderRadius: 999 },
  mockDockText: { fontFamily: fonts.medium, fontSize: 11, color: colors.paper, flex: 1 },
  mockCal: { gap: 6 },
  mockCalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mockCalTime: { fontFamily: fonts.medium, fontSize: 11, color: colors.carbon, opacity: 0.6, width: 34 },
  mockCalBlock: { flex: 1, borderRadius: 8 },
  mockHeat: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  mockHeatCell: { width: 22, height: 22, borderRadius: 6, backgroundColor: colors.mint },
});
