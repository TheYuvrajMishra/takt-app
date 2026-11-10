// Takt — in-app APK installer support (Fix 6, auto-updater).
// Config plugin: adds the REQUEST_INSTALL_PACKAGES permission (required
// to request installing an APK the app downloaded itself) and a
// FileProvider so the downloaded APK can be handed to Android's package
// installer as a content:// URI (Android 7+ forbids file:// URIs across
// apps). The provider only exposes the app's own cache/updates/
// directory — nothing else. No native code. Android-only.
// NOTE: if this plugin is ever removed from app.json, a non-clean
// prebuild leaves a stale res/xml/file_provider_paths.xml behind (and
// the manifest entries, since nothing removes them). CI is always a
// fresh checkout, so this only matters locally — run prebuild --clean.
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';
const PROVIDER_NAME = 'androidx.core.content.FileProvider';
const PROVIDER_META_NAME = 'android.support.FILE_PROVIDER_PATHS';
const PROVIDER_META_RESOURCE = '@xml/file_provider_paths';

// cache-path maps to the app's cache dir; the updater downloads to
// cache/updates/app-release.apk, so only that subfolder is exposed.
const FILE_PROVIDER_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <cache-path name="updates" path="updates/" />
</paths>
`;

/**
 * Pure: add the install permission + FileProvider to a parsed
 * AndroidManifest object (the @expo/config-plugins modResults shape:
 * { manifest: { application: [...] } }). Idempotent — a second
 * application does not duplicate either entry. Exported for tests.
 * `packageName` is the app id (com.takt.app); the provider authority
 * is `<package>.fileprovider`, matching the updater's content URI.
 */
function addApkInstaller(modResults, packageName) {
  const manifest = modResults && modResults.manifest;
  if (!manifest) return modResults;

  // uses-permission lives at the manifest root.
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  const hasPermission = manifest['uses-permission'].some(
    (p) => p.$ && p.$['android:name'] === INSTALL_PERMISSION,
  );
  if (!hasPermission) {
    manifest['uses-permission'].push({ $: { 'android:name': INSTALL_PERMISSION } });
  }

  const app = manifest.application && manifest.application[0];
  if (!app) return modResults;
  app.provider = app.provider || [];
  const authority = `${packageName}.fileprovider`;
  const exists = app.provider.some(
    (p) => p.$ && p.$['android:authorities'] === authority,
  );
  if (!exists) {
    app.provider.push({
      $: {
        'android:name': PROVIDER_NAME,
        'android:authorities': authority,
        'android:exported': 'false',
        'android:grantUriPermissions': 'true',
      },
      'meta-data': [
        {
          $: {
            'android:name': PROVIDER_META_NAME,
            'android:resource': PROVIDER_META_RESOURCE,
          },
        },
      ],
    });
  }
  return modResults;
}

function withApkInstaller(config) {
  config = withAndroidManifest(config, (config) => {
    config.modResults = addApkInstaller(
      config.modResults,
      (config.android && config.android.package) || 'com.takt.app',
    );
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(xmlDir, 'file_provider_paths.xml'),
        FILE_PROVIDER_PATHS_XML,
      );
      return config;
    },
  ]);

  return config;
}

module.exports = withApkInstaller;
module.exports.addApkInstaller = addApkInstaller;
module.exports.FILE_PROVIDER_PATHS_XML = FILE_PROVIDER_PATHS_XML;
