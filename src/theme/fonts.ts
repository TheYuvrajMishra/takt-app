// Takt — Inter Tight font loading (expo-font via @expo-google-fonts/inter-tight).
// Only the three weights DESIGN.md allows: Regular 400, Medium 500, SemiBold 600.
// The family names registered here match `fonts` in theme/tokens.ts exactly.
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  useFonts as useGoogleFonts,
} from '@expo-google-fonts/inter-tight';

export function useTaktFonts(): [boolean, Error | null] {
  const [loaded, error] = useGoogleFonts({
    'InterTight-Regular': InterTight_400Regular,
    'InterTight-Medium': InterTight_500Medium,
    'InterTight-SemiBold': InterTight_600SemiBold,
  });
  return [loaded, error];
}
