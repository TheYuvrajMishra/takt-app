// Regression guard for the on-device crash (reported by Yuvraj 2026-11-10):
// "com.facebook.jni.CppException: [Worklets] Tried to synchronously call a
// Remote Function. Called 'anonymous' on the UI Runtime." — pinch to zoom
// crashed because the pinch worklet called the plain `clamp` helper, and
// BlockCard's drag/resize worklets called the plain `snap5` helper. A plain
// function called from a worklet is treated as a remote (JS-thread) function
// and throws on device. Any helper called from a gesture callback or
// useAnimatedStyle must carry the 'worklet' directive. This test reads the
// sources (via Vite ?raw imports) and fails if either directive is removed.
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import/no-unresolved
import CORE_SRC from '../../lib/core.ts?raw';
// eslint-disable-next-line import/no-unresolved
import CALENDAR_SRC from '../../app/(tabs)/calendar.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import BLOCK_CARD_SRC from '../../components/calendar/BlockCard.tsx?raw';

function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('}', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('worklet-called helpers', () => {
  it('snap5 is a worklet (BlockCard drag/resize call it from Pan onUpdate)', () => {
    expect(BLOCK_CARD_SRC).toContain('snap5(');
    const body = functionBody(CORE_SRC, 'export function snap5(');
    expect(body).toContain("'worklet'");
  });

  it('clamp is a worklet (calendar pinch onUpdate calls it)', () => {
    expect(CALENDAR_SRC).toContain('clamp(baseH.value');
    const body = functionBody(CALENDAR_SRC, 'function clamp(');
    expect(body).toContain("'worklet'");
  });
});
