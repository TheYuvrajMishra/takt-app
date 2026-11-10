// Takt — PaperTexture. A subtle paper grain on a card: the film-grain
// tile (theme/grain.ts) at low opacity, clipped to the card's radius.
// pointerEvents none so it never intercepts touches. Render it last
// inside a card (above the fill, below nothing interactive — it is
// translucent, so text stays crisp through it).
import { Image, StyleSheet } from 'react-native';
import { GRAIN_DATA_URI } from '../theme/grain';

export function PaperTexture({ radius, opacity = 0.05 }: { radius?: number; opacity?: number }) {
  return (
    <Image
      source={{ uri: GRAIN_DATA_URI }}
      resizeMode="repeat"
      pointerEvents="none"
      aria-hidden
      style={[StyleSheet.absoluteFill, { opacity, borderRadius: radius }]}
    />
  );
}
