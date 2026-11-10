// Takt — reduced-motion hook + shared motion language. True when the user asked for reduced motion
// in Settings OR the OS reports it (Reanimated's system hook). Animated
// components read this and skip springs/staggers/timed eases, applying the
// end state instantly instead. Previously the Settings toggle was stored
// but never read, so it did nothing.
//
// Motion law: NO spring, NO overshoot, NO bounce anywhere. Every animation
// is timing-based with the same decelerate bezier (0.22, 1, 0.36, 1).
import { Easing } from 'react-native-reanimated';
import { useReducedMotion as useSystemReducedMotion } from 'react-native-reanimated';
import { useStore } from '../store/useStore';

/** The one easing curve in the app: decelerate, no overshoot. */
export const DECEL = Easing.bezier(0.22, 1, 0.36, 1);

/** Press-and-hold time that arms a drag / selects a chip. One constant, used everywhere. */
export const HOLD_MS = 300;

/** Finger movement beyond this before the hold completes cancels it (treated as a scroll). */
export const HOLD_CANCEL_PX = 8;

/** Navbar tab change + pill morph duration. */
export const NAV_MS = 300;

/** Sheet open / close / settle duration. */
export const SHEET_MS = 240;

export function useAppReducedMotion(): boolean {
  const setting = useStore((s) => s.settings.reduceMotion);
  const system = useSystemReducedMotion();
  return setting || system === true;
}
