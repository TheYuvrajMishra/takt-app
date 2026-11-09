import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts, hairline, radii, spacing } from '../theme/tokens';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, type Settings } from '../types';
import { CategoryIcon } from '../components/CategoryIcon';

// TODO (store wiring): `src/store/useStore.ts` does not exist yet (Worker A).
// Settings below are local state seeded from DEFAULT_SETTINGS. When the
// store lands, initialise from it and persist every change through it.
// Backup/restore and the test nudge are likewise guarded until their
// backing modules exist — see the notes on each handler.

const BACKUP_FILENAME = 'takt-backup.json';

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTimeLabel(min: number): string {
  const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function Stepper({
  label,
  value,
  display,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
}: {
  label: string;
  value: string;
  display?: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={onDec} disabled={decDisabled} style={[styles.stepButton, decDisabled && styles.stepDisabled]} accessibilityLabel={`Decrease ${label}`}>
          <Text style={styles.stepButtonText}>-</Text>
        </Pressable>
        <Text style={styles.stepValue}>{display ?? value}</Text>
        <Pressable onPress={onInc} disabled={incDisabled} style={[styles.stepButton, incDisabled && styles.stepDisabled]} accessibilityLabel={`Increase ${label}`}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(10,10,10,0.15)', true: colors.carbon }}
        thumbColor={colors.paper}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dndDefault, setDndDefault] = useState(false);
  const [dndCats, setDndCats] = useState<string[]>(['cat-sleep']);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }));

  const testNudgeNow = async () => {
    try {
      // `src/lib/nudge.ts` does not exist yet (Worker A). Dynamic import by
      // variable so the bundler/typechecker do not hard-require it.
      const nudgePath = '../lib/nudge';
      const mod = (await import(nudgePath)) as { testNudgeNow?: () => Promise<void> | void };
      if (typeof mod.testNudgeNow === 'function') {
        await mod.testNudgeNow();
        showToast('Test nudge sent.');
      } else {
        showToast('nudge engine wiring pending');
      }
    } catch {
      showToast('nudge engine wiring pending');
    }
  };

  const backup = async () => {
    try {
      const fsName = 'expo-file-system';
      const sharingName = 'expo-sharing';
      const fs = (await import(fsName)) as {
        documentDirectory: string | null;
        writeAsStringAsync: (uri: string, content: string) => Promise<void>;
      };
      const sharing = (await import(sharingName)) as {
        isAvailableAsync: () => Promise<boolean>;
        shareAsync: (uri: string) => Promise<void>;
      };
      if (!fs.documentDirectory) throw new Error('no document directory');
      const payload = JSON.stringify(
        { app: 'Takt', version: '1.0.0', exportedAt: new Date().toISOString(), settings, dndDefault, dndCats },
        null,
        2,
      );
      const uri = fs.documentDirectory + BACKUP_FILENAME;
      await fs.writeAsStringAsync(uri, payload);
      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(uri);
      }
      showToast('Backup saved to ' + BACKUP_FILENAME);
    } catch {
      // expo-file-system / expo-sharing are not installed yet.
      showToast('Backup needs expo-file-system — not installed yet.');
    }
  };

  const restore = async () => {
    try {
      const fsName = 'expo-file-system';
      const fs = (await import(fsName)) as {
        documentDirectory: string | null;
        getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
        readAsStringAsync: (uri: string) => Promise<string>;
      };
      if (!fs.documentDirectory) throw new Error('no document directory');
      const uri = fs.documentDirectory + BACKUP_FILENAME;
      const info = await fs.getInfoAsync(uri);
      if (!info.exists) {
        showToast('No local backup found yet — back up first.');
        return;
      }
      const raw = await fs.readAsStringAsync(uri);
      const parsed = JSON.parse(raw) as { settings?: Settings; dndDefault?: boolean; dndCats?: string[] };
      if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (typeof parsed.dndDefault === 'boolean') setDndDefault(parsed.dndDefault);
      if (Array.isArray(parsed.dndCats)) setDndCats(parsed.dndCats);
      showToast('Backup restored.');
    } catch {
      showToast('Restore needs expo-file-system — not installed yet.');
    }
  };

  const replayOnboarding = () => {
    try {
      router.push('/onboarding');
    } catch {
      showToast('Onboarding route is not mounted yet.');
    }
  };

  const toggleDndCat = (id: string) =>
    setDndCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>Nudges</Text>
      <View style={styles.card}>
        <Stepper
          label="Nudge interval"
          value={`${settings.nudgeIntervalMin} min`}
          onDec={() => patch({ nudgeIntervalMin: Math.max(5, settings.nudgeIntervalMin - 1) })}
          onInc={() => patch({ nudgeIntervalMin: Math.min(10, settings.nudgeIntervalMin + 1) })}
          decDisabled={settings.nudgeIntervalMin <= 5}
          incDisabled={settings.nudgeIntervalMin >= 10}
        />
        <View style={styles.divider} />
        <Stepper
          label="Max nudges per block"
          value={`${settings.maxNudgesPerBlock}`}
          onDec={() => patch({ maxNudgesPerBlock: Math.max(1, settings.maxNudgesPerBlock - 1) })}
          onInc={() => patch({ maxNudgesPerBlock: Math.min(30, settings.maxNudgesPerBlock + 1) })}
          decDisabled={settings.maxNudgesPerBlock <= 1}
          incDisabled={settings.maxNudgesPerBlock >= 30}
        />
        <View style={styles.divider} />
        <Stepper
          label="Nudges per day (cap)"
          value={`${settings.perDayNudgeCap}`}
          onDec={() => patch({ perDayNudgeCap: Math.max(5, settings.perDayNudgeCap - 5) })}
          onInc={() => patch({ perDayNudgeCap: Math.min(100, settings.perDayNudgeCap + 5) })}
          decDisabled={settings.perDayNudgeCap <= 5}
          incDisabled={settings.perDayNudgeCap >= 100}
        />
      </View>

      <Text style={styles.sectionTitle}>Quiet hours</Text>
      <View style={styles.card}>
        <Stepper
          label="Quiet from"
          value={settings.quietHoursStart}
          onDec={() => patch({ quietHoursStart: minToTimeLabel(timeToMin(settings.quietHoursStart) - 30) })}
          onInc={() => patch({ quietHoursStart: minToTimeLabel(timeToMin(settings.quietHoursStart) + 30) })}
        />
        <View style={styles.divider} />
        <Stepper
          label="Quiet until"
          value={settings.quietHoursEnd}
          onDec={() => patch({ quietHoursEnd: minToTimeLabel(timeToMin(settings.quietHoursEnd) - 30) })}
          onInc={() => patch({ quietHoursEnd: minToTimeLabel(timeToMin(settings.quietHoursEnd) + 30) })}
        />
        <Text style={styles.hint}>No nudges fire during quiet hours.</Text>
      </View>

      <Text style={styles.sectionTitle}>Do not nudge</Text>
      <View style={styles.card}>
        <ToggleRow
          label="New blocks do not nudge by default"
          hint="Applies to blocks you add from now on."
          value={dndDefault}
          onChange={setDndDefault}
        />
        {DEFAULT_CATEGORIES.map((cat) => (
          <View key={cat.id}>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.catCell}>
                <CategoryIcon icon={cat.icon} color={cat.color} size={24} />
                <Text style={styles.rowLabel}>{cat.name}</Text>
              </View>
              <Switch
                value={dndCats.includes(cat.id)}
                onValueChange={() => toggleDndCat(cat.id)}
                trackColor={{ false: 'rgba(10,10,10,0.15)', true: colors.carbon }}
                thumbColor={colors.paper}
              />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Experience</Text>
      <View style={styles.card}>
        <ToggleRow label="Haptics" value={settings.haptics} onChange={(v) => patch({ haptics: v })} />
        <View style={styles.divider} />
        <ToggleRow
          label="Large text"
          hint="Bigger type across the app."
          value={settings.largeText}
          onChange={(v) => patch({ largeText: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label="Reduce motion"
          hint="Calms animations and the kinetic headline."
          value={settings.reduceMotion}
          onChange={(v) => patch({ reduceMotion: v })}
        />
      </View>

      <Pressable style={styles.primaryButton} onPress={testNudgeNow}>
        <Text style={styles.primaryButtonText}>Test nudge now</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.card}>
        <Pressable style={styles.actionRow} onPress={backup}>
          <Text style={styles.actionLabel}>Back up to a file</Text>
          <Text style={styles.actionChevron}>{'>'}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.actionRow} onPress={restore}>
          <Text style={styles.actionLabel}>Restore from backup file</Text>
          <Text style={styles.actionChevron}>{'>'}</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.actionRow} onPress={replayOnboarding}>
          <Text style={styles.actionLabel}>Replay onboarding</Text>
          <Text style={styles.actionChevron}>{'>'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Backup is a JSON file saved on this device. No spreadsheets, ever.</Text>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Takt</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
        <Text style={styles.hint}>Your day, nudged into shape.</Text>
      </View>

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cloud },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontFamily: fonts.semibold, fontSize: 34, color: colors.carbon, marginBottom: spacing.md },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.carbon, marginBottom: 8, marginTop: spacing.sm },
  card: { backgroundColor: colors.paper, borderRadius: radii.cardSm, paddingHorizontal: spacing.md, paddingVertical: 4, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.carbon, opacity: 0.6, paddingBottom: 10 },
  divider: { height: 1, backgroundColor: hairline },
  toggleText: { flex: 1, paddingRight: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepButton: { width: 34, height: 34, borderRadius: radii.pill, backgroundColor: colors.cloud, alignItems: 'center', justifyContent: 'center' },
  stepDisabled: { opacity: 0.35 },
  stepButtonText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.carbon },
  stepValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.carbon, minWidth: 64, textAlign: 'center' },
  catCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryButton: { backgroundColor: colors.carbon, borderRadius: radii.pill, paddingVertical: 16, alignItems: 'center', marginVertical: spacing.sm },
  primaryButtonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.paper },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  actionLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.carbon },
  actionChevron: { fontFamily: fonts.semibold, fontSize: 16, color: colors.carbon, opacity: 0.5 },
  version: { fontFamily: fonts.medium, fontSize: 14, color: colors.carbon, opacity: 0.6 },
  toast: { backgroundColor: colors.carbon, borderRadius: radii.pill, paddingVertical: 12, paddingHorizontal: 18, alignSelf: 'center', marginTop: spacing.md },
  toastText: { fontFamily: fonts.medium, fontSize: 14, color: colors.paper, textAlign: 'center' },
});
