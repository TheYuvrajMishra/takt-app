// App-shortcuts plugin tests: the manifest transform is pure and the
// shortcuts XML + drawables are asserted as strings. The plugin is plain
// JS; a static import works because TS infers the module.exports shape
// (allowJs). Note: `node:` imports do not resolve under this tsconfig
// (bundler moduleResolution), so the test loads the plugin this way.
import { describe, expect, it } from 'vitest';
import {
  addShortcutsMetaData,
  DRAWABLES,
  SHORTCUTS_XML,
} from '../../../plugins/with-app-shortcuts';

function launcherManifest() {
  return {
    manifest: {
      application: [
        {
          activity: [
            {
              $: { 'android:name': '.MainActivity' },
              'intent-filter': [
                {
                  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                },
                {
                  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                },
              ],
            },
            { $: { 'android:name': '.OtherActivity' } },
          ],
        },
      ],
    },
  };
}

describe('addShortcutsMetaData', () => {
  it('adds the meta-data to the launcher activity, not the application', () => {
    const out = addShortcutsMetaData(launcherManifest()) as {
      manifest: { application: Array<Record<string, unknown>> };
    };
    const app = out.manifest.application[0];
    expect(app['meta-data']).toBeUndefined();
    const activities = app.activity as Array<Record<string, unknown>>;
    const main = activities[0]['meta-data'] as Array<{ $: Record<string, string> }>;
    expect(main).toHaveLength(1);
    expect(main[0].$['android:name']).toBe('android.app.shortcuts');
    expect(main[0].$['android:resource']).toBe('@xml/shortcuts');
    expect(activities[1]['meta-data']).toBeUndefined();
  });

  it('is idempotent on a second application', () => {
    const manifest = launcherManifest();
    addShortcutsMetaData(manifest);
    const out = addShortcutsMetaData(manifest) as {
      manifest: { application: Array<Record<string, unknown>> };
    };
    const main = (
      out.manifest.application[0].activity as Array<Record<string, unknown>>
    )[0]['meta-data'] as unknown[];
    expect(main).toHaveLength(1);
  });

  it('falls back to the MainActivity name when no LAUNCHER filter exists', () => {
    const manifest = {
      manifest: {
        application: [{ activity: [{ $: { 'android:name': '.MainActivity' } }] }],
      },
    };
    const out = addShortcutsMetaData(manifest) as {
      manifest: { application: Array<Record<string, unknown>> };
    };
    const main = (
      out.manifest.application[0].activity as Array<Record<string, unknown>>
    )[0]['meta-data'] as Array<{ $: Record<string, string> }>;
    expect(main[0].$['android:name']).toBe('android.app.shortcuts');
  });

  it('leaves a manifest with no launcher activity unchanged', () => {
    const manifest = { manifest: { application: [{ activity: [] }] } };
    expect(addShortcutsMetaData(manifest)).toBe(manifest);
    expect(addShortcutsMetaData({})).toEqual({});
    expect(addShortcutsMetaData(null)).toBeNull();
  });
});

describe('SHORTCUTS_XML', () => {
  it('declares exactly three shortcuts with distinct ids, icons and deep links', () => {
    expect(SHORTCUTS_XML).toContain('android:shortcutId="now"');
    expect(SHORTCUTS_XML).toContain('android:shortcutId="calendar"');
    expect(SHORTCUTS_XML).toContain('android:shortcutId="stats"');
    expect(SHORTCUTS_XML).toContain('android:icon="@drawable/ic_shortcut_now"');
    expect(SHORTCUTS_XML).toContain('android:icon="@drawable/ic_shortcut_calendar"');
    expect(SHORTCUTS_XML).toContain('android:icon="@drawable/ic_shortcut_stats"');
    expect(SHORTCUTS_XML).toContain('android:data="takt://"');
    expect(SHORTCUTS_XML).toContain('android:data="takt://calendar"');
    expect(SHORTCUTS_XML).toContain('android:data="takt://stats"');
    expect(SHORTCUTS_XML).toContain('android:targetPackage="com.takt.app"');
    expect(SHORTCUTS_XML).toContain('android:targetClass="com.takt.app.MainActivity"');
  });

  it('keeps short labels within 10 chars and long labels within 25', () => {
    const shorts = [...SHORTCUTS_XML.matchAll(/android:shortcutShortLabel="([^"]+)"/g)].map(
      (m) => m[1],
    );
    const longs = [...SHORTCUTS_XML.matchAll(/android:shortcutLongLabel="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(shorts).toEqual(['What now?', 'Calendar', 'Stats']);
    expect(shorts.every((s) => s.length <= 10)).toBe(true);
    expect(longs).toEqual(['What should I do now?', 'Open the calendar', 'Open your stats']);
    expect(longs.every((s) => s.length <= 25)).toBe(true);
  });

  it('has no emoji in any label', () => {
    // eslint-disable-next-line no-control-regex
    expect(SHORTCUTS_XML).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('DRAWABLES', () => {
  it('provides one vector drawable per shortcut, in the app icon style', () => {
    expect(Object.keys(DRAWABLES).sort()).toEqual([
      'ic_shortcut_calendar.xml',
      'ic_shortcut_now.xml',
      'ic_shortcut_stats.xml',
    ]);
    for (const content of Object.values(DRAWABLES)) {
      expect(content).toContain('<vector');
      expect(content).toContain('android:viewportWidth="24"');
      expect(content).toContain('android:strokeColor="#0A0A0A"');
      expect(content).toContain('android:strokeWidth="1.75"');
    }
  });
});
