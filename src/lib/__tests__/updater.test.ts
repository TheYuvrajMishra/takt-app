// Auto-updater tests: version comparison, payload validation, throttle
// and "Later" suppression, size formatting, content-URI shape. The
// download/install flows touch the device (network, file system, package
// installer) and are verified by the CI build + release checks instead.
// The helpers live in updaterCore (no native imports), so no mocks are
// needed here.
import { describe, expect, it } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  LATER_SUPPRESS_MS,
  contentUriFor,
  formatSize,
  isNewer,
  isSuppressed,
  parseVersionInfo,
  shouldCheckNow,
  type VersionInfo,
} from '../updaterCore';

const REMOTE: VersionInfo = {
  versionCode: 15,
  versionName: '1.0.0',
  apkUrl: 'https://github.com/TheYuvrajMishra/takt-app/releases/latest/download/app-release.apk',
  sha256: 'a'.repeat(64),
  sizeBytes: 53_186_083,
  notes: 'Fixes the dock and the calendar.',
  publishedAt: '2026-11-10T04:00:00.000Z',
};

describe('parseVersionInfo', () => {
  it('accepts a complete, well-formed payload', () => {
    expect(parseVersionInfo(REMOTE)).toEqual(REMOTE);
  });

  it('rejects missing or malformed fields', () => {
    expect(parseVersionInfo(null)).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, versionCode: 0 })).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, versionCode: '15' })).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, apkUrl: 'http://example.com/a.apk' })).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, sha256: 'xyz' })).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, sizeBytes: -1 })).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, notes: 42 })).toBeNull();
    expect(parseVersionInfo({ ...REMOTE, publishedAt: '' })).toBeNull();
  });
});

describe('isNewer', () => {
  it('compares versionCode only', () => {
    expect(isNewer(14, REMOTE)).toBe(true);
    expect(isNewer(15, REMOTE)).toBe(false);
    expect(isNewer(16, REMOTE)).toBe(false);
    expect(isNewer(0, REMOTE)).toBe(true);
  });
});

describe('shouldCheckNow', () => {
  it('throttles automatic checks to once per 6h, manual always runs', () => {
    const now = 1_000_000_000;
    expect(shouldCheckNow(now, 0, false)).toBe(true);
    expect(shouldCheckNow(now, now - CHECK_INTERVAL_MS + 1000, false)).toBe(false);
    expect(shouldCheckNow(now, now - CHECK_INTERVAL_MS, false)).toBe(true);
    expect(shouldCheckNow(now, now - 1000, true)).toBe(true);
  });
});

describe('isSuppressed', () => {
  it('suppresses only the dismissed version, only for 24h', () => {
    const now = 1_000_000_000;
    expect(isSuppressed(now, 15, now - 1000, 15)).toBe(true);
    expect(isSuppressed(now, 15, now - LATER_SUPPRESS_MS, 15)).toBe(false);
    expect(isSuppressed(now, 15, now - 1000, 16)).toBe(false);
    expect(isSuppressed(now, 0, 0, 15)).toBe(false);
  });
});

describe('formatSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(53_186_083)).toBe('51 MB');
  });
});

describe('contentUriFor', () => {
  it('builds the FileProvider URI the installer expects', () => {
    expect(contentUriFor('com.takt.app', 'app-release.apk')).toBe(
      'content://com.takt.app.fileprovider/updates/app-release.apk',
    );
  });
});
