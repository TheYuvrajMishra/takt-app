// Takt — static launcher shortcuts (long-press the app icon).
// "What now?" opens Today (the now screen), "Calendar" and "Stats" open
// their tabs, each via the takt:// deep-link scheme (expo-router).
// Implemented as a config plugin: adds the android.app.shortcuts
// meta-data to the LAUNCHER ACTIVITY (per Android docs — an
// application-level entry is silently ignored, shortcuts never appear)
// and writes res/xml/shortcuts.xml plus one distinct vector drawable per
// shortcut. No native code. Android-only; iOS Quick Actions are out of
// scope. A full home-screen widget (RemoteViews + provider + periodic
// updates) is deliberately NOT this: it needs native code and on-device
// verification we cannot do here — see KNOWN_ISSUES.md.
// NOTE: if this plugin is ever removed from app.json, a non-clean
// prebuild leaves a stale res/xml/shortcuts.xml + drawables behind (and
// the manifest meta-data, since nothing removes it). CI is always a
// fresh checkout, so this only matters locally — run prebuild --clean.
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SHORTCUTS_META_NAME = 'android.app.shortcuts';
const SHORTCUTS_META_RESOURCE = '@xml/shortcuts';

// One distinct icon per shortcut (Carbon #0A0A0A stroke, 1.75px, round
// caps — the app's icon style), so the three entries are distinguishable
// in the long-press popup instead of three identical launcher icons.
const DRAWABLES = {
  'ic_shortcut_now.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:pathData="M12,12 m-8.5,0 a8.5,8.5 0,1,1 17,0 a8.5,8.5 0,1,1 -17,0" />
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:pathData="M12,7 L12,12 L15.5,14" />
</vector>
`,
  'ic_shortcut_calendar.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:strokeLineJoin="round"
    android:pathData="M5,6 L5,20 L19,20 L19,6 Z" />
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:pathData="M5,10 L19,10" />
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:pathData="M9,4 L9,8 M15,4 L15,8" />
</vector>
`,
  'ic_shortcut_stats.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="24dp"
  android:height="24dp"
  android:viewportWidth="24"
  android:viewportHeight="24">
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:pathData="M6,20 L6,12 M12,20 L12,8 M18,20 L18,14" />
  <path
    android:fillColor="@android:color/transparent"
    android:strokeColor="#0A0A0A"
    android:strokeWidth="1.75"
    android:strokeLineCap="round"
    android:pathData="M4,20 L20,20" />
</vector>
`,
};

// Labels MUST be string resources: aapt rejects literal strings here
// (shortcutShortLabel/shortcutLongLabel are reference-type attributes —
// CI failed on 'What now?' is incompatible with attribute
// shortcutShortLabel (attr) reference). The strings live in
// res/values/shortcuts_strings.xml, written by the same dangerous mod.
const STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="shortcut_now_short">What now?</string>
  <string name="shortcut_now_long">What should I do now?</string>
  <string name="shortcut_calendar_short">Calendar</string>
  <string name="shortcut_calendar_long">Open the calendar</string>
  <string name="shortcut_stats_short">Stats</string>
  <string name="shortcut_stats_long">Open your stats</string>
</resources>
`;

const SHORTCUTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Static launcher shortcuts for Takt. Labels are @string references. -->
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="now"
    android:enabled="true"
    android:icon="@drawable/ic_shortcut_now"
    android:shortcutShortLabel="@string/shortcut_now_short"
    android:shortcutLongLabel="@string/shortcut_now_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.takt.app"
      android:targetClass="com.takt.app.MainActivity"
      android:data="takt://" />
  </shortcut>
  <shortcut
    android:shortcutId="calendar"
    android:enabled="true"
    android:icon="@drawable/ic_shortcut_calendar"
    android:shortcutShortLabel="@string/shortcut_calendar_short"
    android:shortcutLongLabel="@string/shortcut_calendar_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.takt.app"
      android:targetClass="com.takt.app.MainActivity"
      android:data="takt://calendar" />
  </shortcut>
  <shortcut
    android:shortcutId="stats"
    android:enabled="true"
    android:icon="@drawable/ic_shortcut_stats"
    android:shortcutShortLabel="@string/shortcut_stats_short"
    android:shortcutLongLabel="@string/shortcut_stats_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.takt.app"
      android:targetClass="com.takt.app.MainActivity"
      android:data="takt://stats" />
  </shortcut>
</shortcuts>
`;

/**
 * Pure: add the shortcuts meta-data to the LAUNCHER ACTIVITY of a parsed
 * AndroidManifest object (the @expo/config-plugins modResults shape:
 * { manifest: { application: [{ activity: [...] }] } }). Idempotent —
 * a second application does not duplicate the entry. Exported for tests.
 * Returns the manifest object unchanged when no launcher activity exists.
 */
function addShortcutsMetaData(modResults) {
  const manifest = modResults && modResults.manifest;
  const app = manifest && manifest.application && manifest.application[0];
  if (!app || !Array.isArray(app.activity)) return modResults;
  const isLauncher = (activity) => {
    const filters = activity['intent-filter'] || [];
    return filters.some((f) => {
      const actions = (f.action || []).map((a) => a.$ && a.$['android:name']);
      const categories = (f.category || []).map((c) => c.$ && c.$['android:name']);
      return (
        actions.includes('android.intent.action.MAIN') &&
        categories.includes('android.intent.category.LAUNCHER')
      );
    });
  };
  const launcher =
    app.activity.find(isLauncher) ||
    app.activity.find(
      (a) => a.$ && typeof a.$['android:name'] === 'string' && a.$['android:name'].endsWith('MainActivity'),
    );
  if (!launcher) return modResults;
  launcher['meta-data'] = launcher['meta-data'] || [];
  const exists = launcher['meta-data'].some(
    (m) => m.$ && m.$['android:name'] === SHORTCUTS_META_NAME,
  );
  if (!exists) {
    launcher['meta-data'].push({
      $: {
        'android:name': SHORTCUTS_META_NAME,
        'android:resource': SHORTCUTS_META_RESOURCE,
      },
    });
  }
  return modResults;
}

function withAppShortcuts(config) {
  config = withAndroidManifest(config, (config) => {
    config.modResults = addShortcutsMetaData(config.modResults);
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resRoot = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
      );
      const xmlDir = path.join(resRoot, 'xml');
      const drawableDir = path.join(resRoot, 'drawable');
      const valuesDir = path.join(resRoot, 'values');
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.mkdir(drawableDir, { recursive: true });
      await fs.promises.mkdir(valuesDir, { recursive: true });
      await fs.promises.writeFile(path.join(xmlDir, 'shortcuts.xml'), SHORTCUTS_XML);
      await fs.promises.writeFile(
        path.join(valuesDir, 'shortcuts_strings.xml'),
        STRINGS_XML,
      );
      for (const [name, content] of Object.entries(DRAWABLES)) {
        await fs.promises.writeFile(path.join(drawableDir, name), content);
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withAppShortcuts;
module.exports.addShortcutsMetaData = addShortcutsMetaData;
module.exports.SHORTCUTS_XML = SHORTCUTS_XML;
module.exports.STRINGS_XML = STRINGS_XML;
module.exports.DRAWABLES = DRAWABLES;
