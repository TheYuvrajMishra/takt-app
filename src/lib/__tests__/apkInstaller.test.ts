// APK-installer plugin tests: the manifest transform is pure and the
// file-provider paths XML is asserted as a string (mirrors
// appShortcuts.test.ts).
import { describe, expect, it } from 'vitest';
import { addApkInstaller, FILE_PROVIDER_PATHS_XML } from '../../../plugins/with-apk-installer';

function emptyManifest() {
  return { manifest: { application: [{}] } };
}

describe('addApkInstaller', () => {
  it('adds the install permission and the FileProvider, idempotently', () => {
    const m = emptyManifest() as never;
    addApkInstaller(m, 'com.takt.app');
    addApkInstaller(m, 'com.takt.app');
    const manifest = (m as { manifest: Record<string, unknown> }).manifest;
    const perms = manifest['uses-permission'] as { $: { 'android:name': string } }[];
    expect(perms.filter((p) => p.$['android:name'] === 'android.permission.REQUEST_INSTALL_PACKAGES')).toHaveLength(1);
    const app = (manifest.application as Record<string, unknown>[])[0];
    const providers = app.provider as { $: Record<string, string>; 'meta-data': { $: Record<string, string> }[] }[];
    expect(providers).toHaveLength(1);
    expect(providers[0].$['android:authorities']).toBe('com.takt.app.fileprovider');
    expect(providers[0].$['android:name']).toBe('androidx.core.content.FileProvider');
    expect(providers[0].$['android:exported']).toBe('false');
    expect(providers[0].$['android:grantUriPermissions']).toBe('true');
    expect(providers[0]['meta-data'][0].$['android:name']).toBe('android.support.FILE_PROVIDER_PATHS');
    expect(providers[0]['meta-data'][0].$['android:resource']).toBe('@xml/file_provider_paths');
  });

  it('leaves a manifest without an application untouched (except permission)', () => {
    const m = { manifest: {} } as never;
    expect(() => addApkInstaller(m, 'com.takt.app')).not.toThrow();
  });
});

describe('FILE_PROVIDER_PATHS_XML', () => {
  it('exposes only the cache updates folder', () => {
    expect(FILE_PROVIDER_PATHS_XML).toContain('<cache-path name="updates" path="updates/" />');
    expect(FILE_PROVIDER_PATHS_XML).not.toContain('external-path');
    expect(FILE_PROVIDER_PATHS_XML).not.toContain('files-path');
  });
});
