// Takt — PaperTexture. A subtle paper grain on a surface: a tiled PNG
// at low opacity, clipped to the surface's radius. pointerEvents none so
// it never intercepts touches. Render it last inside a surface (above the
// fill, below nothing interactive — it is translucent, so text stays
// crisp through it).
//
// Three different kinds, one per surface type — they must read as
// different materials, not the same speckle everywhere:
//   fine   — the 128x128 noise tile (theme/grain.ts): cards, calendar blocks
//   coarse — chunky 4x4-block noise (theme/textures.ts): buttons, dock nodes
//   linen  — a woven thread pattern (theme/textures.ts): sheets, drawers
import { Image, StyleSheet } from 'react-native';
import { GRAIN_DATA_URI } from '../theme/grain';
import { COARSE_GRAIN_DATA_URI, LINEN_DATA_URI } from '../theme/textures';

export type TextureKind = 'fine' | 'coarse' | 'linen';

const URIS: Record<TextureKind, string> = {
  fine: GRAIN_DATA_URI,
  coarse: COARSE_GRAIN_DATA_URI,
  linen: LINEN_DATA_URI,
};

const DEFAULT_OPACITY: Record<TextureKind, number> = {
  fine: 0.05,
  coarse: 0.06,
  linen: 0.06,
};

export function PaperTexture({
  radius,
  opacity,
  kind = 'fine',
}: {
  radius?: number;
  opacity?: number;
  kind?: TextureKind;
}) {
  return (
    <Image
      source={{ uri: URIS[kind] }}
      resizeMode="repeat"
      pointerEvents="none"
      aria-hidden
      style={[StyleSheet.absoluteFill, { opacity: opacity ?? DEFAULT_OPACITY[kind], borderRadius: radius }]}
    />
  );
}
