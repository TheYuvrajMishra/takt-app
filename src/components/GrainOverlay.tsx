// Takt — film grain overlay. Tiled noise PNG (see theme/grain.ts) at ~5%
// opacity over the whole app. Cheap: a single repeating Image, no Skia
// shader work per frame. pointerEvents none so it never intercepts touches.
import { Image, StyleSheet, View } from 'react-native';
import { GRAIN_DATA_URI } from '../theme/grain';

export function GrainOverlay({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <View style={styles.root} pointerEvents="none" aria-hidden>
      <Image
        source={{ uri: GRAIN_DATA_URI }}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    zIndex: 999,
  },
});
