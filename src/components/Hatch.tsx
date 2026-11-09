// Takt — 45° diagonal hatch pattern (react-native-svg). Used for
// "unfilled"/upcoming segments and hatched card accents (DESIGN.md).
import { useId } from 'react';
import type { ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { colors } from '../theme/tokens';

export interface HatchProps {
  /** Stripe color. Defaults to carbon. */
  color?: string;
  /** Overall opacity of the stripes. */
  opacity?: number;
  /** Tile size in px (stripe spacing). */
  spacing?: number;
  strokeWidth?: number;
  style?: ViewStyle;
}

/**
 * Fills its parent with diagonal hatch lines. Parent should have
 * overflow: 'hidden' + a border radius if the hatch must be clipped.
 */
export function Hatch({
  color = colors.carbon,
  opacity = 0.14,
  spacing = 8,
  strokeWidth = 1,
  style,
}: HatchProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const patternId = `hatch-${id}`;
  return (
    <View style={[styles.root, style]} pointerEvents="none" aria-hidden>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={patternId}
            width={spacing}
            height={spacing}
            patternUnits="userSpaceOnUse"
          >
            <Line
              x1={0}
              y1={spacing}
              x2={spacing}
              y2={0}
              stroke={color}
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});
