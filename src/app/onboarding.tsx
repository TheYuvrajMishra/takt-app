import { useRef, useState } from 'react';
import { Linking, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/TText';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { colors, fonts, hairline, radii, spacing, categoryColorHex } from '../theme/tokens';
import { DEFAULT_CATEGORIES, type Category, type Settings } from '../types';
import { dateKey, earliestEmptySlot, minToTime, snap5 } from '../lib/core';
import { CategoryIcon } from '../components/CategoryIcon';
import { useStore } from '../store/useStore';
import { requestNudgePermissions, rescheduleIfPermitted } from '../lib/nudge';

// On finish, `settings.onboardingDone` is persisted through the store and
// the root layout's onboarding gate stops redirecting here.
// Steps 3–4 (category picks, sandbox timeline) are still local state:
// the sandbox is explicitly "nothing is saved yet", and there is no store
// field for the picked-category set. Step 7 schedules a real block.

export function shouldShowOnboarding(settings: Settings): boolean {
  return !settings.onboardingDone;
}

const TOTAL_STEPS = 7;

interface MiniBlock {
  id: string;
  categoryId: string;
  title: string;
  startMin: number;
  durationMin: number;
}

const TL_START = 7 * 60;
const TL_END = 21 * 60;
const TL_HEIGHT = 420;
const PX_PER_MIN = TL_HEIGHT / (TL_END - TL_START);

const RADIAL_CATS = ['cat-food', 'cat-workout', 'cat-learning', 'cat-journaling', 'cat-study'];

export default function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const updateSettings = useStore((s) => s.updateSettings);
  const addBlock = useStore((s) => s.addBlock);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  // Step 2
  const [notifStatus, setNotifStatus] = useState<string>('not asked');

  // Step 3
  const [cats, setCats] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [pickedCats, setPickedCats] = useState<string[]>(DEFAULT_CATEGORIES.map((c) => c.id));
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Step 4 — guided sandbox timeline (local state only)
  const [miniBlocks, setMiniBlocks] = useState<MiniBlock[]>([
    { id: 'mb-1', categoryId: 'cat-workout', title: 'Morning run', startMin: 7 * 60, durationMin: 30 },
    { id: 'mb-2', categoryId: 'cat-food', title: 'Breakfast', startMin: 8 * 60, durationMin: 30 },
  ]);
  const [selectedBlockId, setSelectedBlockId] = useState<string>('mb-1');
  const [radialOpen, setRadialOpen] = useState(false);
  const [scope, setScope] = useState<'today' | 'onwards'>('today');
  const dragStartMin = useRef(0);

  // Step 5
  const [nudgeSent, setNudgeSent] = useState(false);
  const [demoDone, setDemoDone] = useState(false);

  // Step 7
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
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Takt nudge',
          body: 'Morning run starts now — tap the nudge to open Takt.',
        },
        trigger: null,
      });
      setNudgeSent(true);
    } catch {
      // A failed schedule used to report success anyway; stay honest so the
      // user retries instead of trusting a nudge that never fired.
      setNudgeSent(false);
    }
  };

  // --- Step 4 helpers -------------------------------------------------------
  const selectedBlock = miniBlocks.find((b) => b.id === selectedBlockId) ?? miniBlocks[0];

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartMin.current = miniBlocks[0]?.startMin ?? TL_START;
      },
      onPanResponderMove: (_e, gs) => {
        const next = snap5(dragStartMin.current + Math.round(gs.dy / PX_PER_MIN));
        const clamped = Math.max(TL_START, Math.min(TL_END - 30, next));
        setMiniBlocks((prev) =>
          prev.map((b) => (b.id === miniBlocks[0]?.id ? { ...b, startMin: clamped } : b)),
        );
      },
      onPanResponderRelease: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      },
    }),
  ).current;

  const addBlockFromRadial = (categoryId: string) => {
    const cat = cats.find((c) => c.id === categoryId);
    if (!cat) return;
    const blocks = miniBlocks.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      title: b.title,
      startMin: b.startMin,
      durationMin: b.durationMin,
    }));
    const slot = earliestEmptySlot(blocks, TL_START, 30);
    const start = slot ?? TL_START;
    const block: MiniBlock = {
      id: `mb-${Date.now()}`,
      categoryId,
      title: cat.name,
      startMin: start,
      durationMin: 30,
    };
    setMiniBlocks((prev) => [...prev, block]);
    setSelectedBlockId(block.id);
    setRadialOpen(false);
  };

  const resizeSelected = (delta: number) => {
    if (!selectedBlock) return;
    setMiniBlocks((prev) =>
      prev.map((b) =>
        b.id === selectedBlock.id
          ? { ...b, durationMin: Math.max(10, Math.min(120, b.durationMin + delta)) }
          : b,
      ),
    );
  };

  const moveSelected = (delta: number) => {
    if (!selectedBlock) return;
    setMiniBlocks((prev) =>
      prev.map((b) =>
        b.id === selectedBlock.id
          ? { ...b, startMin: Math.max(TL_START, Math.min(TL_END - b.durationMin, b.startMin + delta)) }
          : b,
      ),
    );
  };

  if (done) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>You are all set.</Text>
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

      <ScrollView contentContainerStyle={styles.content}>
        {step === 1 && (
          <>
            <Text style={styles.title}>Your day, nudged into shape</Text>
            <Text style={styles.body}>
              Takt keeps your routine on a timeline and nudges you until the thing is done. No
              shouting, no streak-shaming — just a steady tap on the shoulder.
            </Text>
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
            {cats.map((cat) => {
              const picked = pickedCats.includes(cat.id);
              return (
                <View key={cat.id} style={[styles.card, styles.catRow]}>
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
                </View>
              );
            })}
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>Build your first day</Text>
            <Text style={styles.body}>
              This is a sandbox — nothing is saved yet. Drag the first block up or down, tap a
              block to resize it, and open the radial to add one.
            </Text>

            <View style={styles.timeline}>
              {miniBlocks.map((b, idx) => {
                const cat = cats.find((c) => c.id === b.categoryId);
                const top = (b.startMin - TL_START) * PX_PER_MIN;
                const height = Math.max(28, b.durationMin * PX_PER_MIN);
                const isFirst = idx === 0;
                const isSelected = b.id === selectedBlockId;
                return (
                  <View
                    key={b.id}
                    style={[
                      styles.node,
                      { top, height, backgroundColor: cat ? categoryColorHex[cat.color] : colors.cloud },
                      isSelected && styles.nodeSelected,
                    ]}
                    {...(isFirst ? dragResponder.panHandlers : {})}
                  >
                    <Pressable
                      onPress={() => setSelectedBlockId(b.id)}
                      style={styles.nodeInner}
                      accessibilityLabel={`${b.title} at ${minToTime(b.startMin)}`}
                    >
                      <Text style={styles.nodeTitle}>{b.title}</Text>
                      <Text style={styles.nodeTime}>
                        {minToTime(b.startMin)} · {b.durationMin} min
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {radialOpen && (
                <View style={styles.radial}>
                  {RADIAL_CATS.map((id, i) => {
                    const cat = cats.find((c) => c.id === id);
                    if (!cat) return null;
                    const angle = (Math.PI * (i + 0.5)) / RADIAL_CATS.length - Math.PI / 2;
                    const x = Math.cos(angle) * 86;
                    const y = Math.sin(angle) * 86;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => addBlockFromRadial(id)}
                        style={[styles.radialItem, { left: 90 + x, top: 90 + y }]}
                        accessibilityLabel={`Add ${cat.name}`}
                      >
                        <CategoryIcon icon={cat.icon} color={cat.color} size={26} />
                        <Text style={styles.radialLabel}>{cat.name}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={styles.radialCenter} onPress={() => setRadialOpen(false)}>
                    <Text style={styles.radialCenterText}>Close</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View style={styles.controlsRow}>
              <Pressable style={styles.smallButton} onPress={() => setRadialOpen((v) => !v)}>
                <Text style={styles.smallButtonText}>{radialOpen ? 'Close radial' : 'Add via radial'}</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={() => moveSelected(-15)}>
                <Text style={styles.smallButtonText}>Earlier</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={() => moveSelected(15)}>
                <Text style={styles.smallButtonText}>Later</Text>
              </Pressable>
            </View>
            <View style={styles.controlsRow}>
              <Pressable style={styles.smallButton} onPress={() => resizeSelected(-5)}>
                <Text style={styles.smallButtonText}>Shorter</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={() => resizeSelected(5)}>
                <Text style={styles.smallButtonText}>Longer</Text>
              </Pressable>
            </View>

            <Text style={styles.scopeLabel}>When this changes, apply it to:</Text>
            <View style={styles.scopeRow}>
              <Pressable
                style={[styles.scopeButton, scope === 'today' && styles.scopeButtonActive]}
                onPress={() => setScope('today')}
              >
                <Text style={[styles.scopeText, scope === 'today' && styles.scopeTextActive]}>Today only</Text>
              </Pressable>
              <Pressable
                style={[styles.scopeButton, scope === 'onwards' && styles.scopeButtonActive]}
                onPress={() => setScope('onwards')}
              >
                <Text style={[styles.scopeText, scope === 'onwards' && styles.scopeTextActive]}>From today onwards</Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 5 && (
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

        {step === 6 && (
          <>
            <Text style={styles.title}>Where things live</Text>
            <Text style={styles.body}>Three tabs, one job each.</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Today</Text>
              <Text style={styles.cardBody}>
                Your timeline for right now. The current task is the hero; the big Done button
                lives at the bottom.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Calendar</Text>
              <Text style={styles.cardBody}>
                Plan ahead, drag blocks between days, and edit with a scope — today only, or
                from today onwards.
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Stats</Text>
              <Text style={styles.cardBody}>
                A monthly heatmap of discipline, streaks, on-time rate, and focus time per
                category.
              </Text>
            </View>
          </>
        )}

        {step === 7 && (
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
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 ? (
          <Pressable style={styles.backButton} onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Pressable style={styles.primaryButton} onPress={() => (step === TOTAL_STEPS ? finish() : setStep((s) => s + 1))}>
          <Text style={styles.primaryButtonText}>{step === TOTAL_STEPS ? 'Start using Takt' : 'Continue'}</Text>
        </Pressable>
      </View>
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
  title: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 38, color: colors.carbon, marginBottom: spacing.sm },
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
  timeline: {
    height: TL_HEIGHT,
    backgroundColor: colors.paper,
    borderRadius: radii.cardSm,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  node: { position: 'absolute', left: 12, right: 12, borderRadius: 16, padding: 10 },
  nodeSelected: { borderWidth: 2, borderColor: colors.carbon },
  nodeInner: { flex: 1 },
  nodeTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon },
  nodeTime: { fontFamily: fonts.medium, fontSize: 13, color: colors.carbon, opacity: 0.7 },
  radial: { position: 'absolute', left: '50%', top: '50%', width: 220, height: 220, marginLeft: -110, marginTop: -110 },
  radialItem: { position: 'absolute', width: 56, height: 56, marginLeft: -28, marginTop: -28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, borderRadius: 999, borderWidth: 1, borderColor: hairline },
  radialLabel: { fontFamily: fonts.medium, fontSize: 10, color: colors.carbon },
  radialCenter: { position: 'absolute', left: 90, top: 90, width: 40, height: 40, marginLeft: -20, marginTop: -20, backgroundColor: colors.carbon, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  radialCenterText: { fontFamily: fonts.medium, fontSize: 11, color: colors.paper },
  controlsRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  scopeLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, marginTop: spacing.sm, marginBottom: 8 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeButton: { flex: 1, borderRadius: radii.pill, borderWidth: 1, borderColor: hairline, backgroundColor: colors.paper, paddingVertical: 12, alignItems: 'center' },
  scopeButtonActive: { backgroundColor: colors.carbon, borderColor: colors.carbon },
  scopeText: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon },
  scopeTextActive: { color: colors.paper },
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
});
