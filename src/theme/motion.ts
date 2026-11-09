// Takt — reduced-motion hook. True when the user asked for reduced motion
// in Settings OR the OS reports it (Reanimated's system hook). Animated
// components read this and skip springs/staggers/timed eases, applying the
// end state instantly instead. Previously the Settings toggle was stored
// but never read, so it did nothing.
import { useReducedMotion as useSystemReducedMotion } from 'react-native-reanimated';
import { useStore } from '../store/useStore';

export function useAppReducedMotion(): boolean {
  const setting = useStore((s) => s.settings.reduceMotion);
  const system = useSystemReducedMotion();
  return setting || system === true;
}
