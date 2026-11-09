import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { categoryColorHex, colors } from '../theme/tokens';
import type { CategoryColorName } from '../theme/tokens';

export interface CategoryIconProps {
  icon: string;
  color?: CategoryColorName;
  size?: number;
}

/**
 * Custom category glyphs: 1.75px stroke, rounded caps, carbon stroke on a
 * color fill (DESIGN.md). Unknown keys fall back to a simple spark glyph.
 */
export function CategoryIcon({ icon, color = 'carbon', size = 24 }: CategoryIconProps) {
  const fill = categoryColorHex[color];
  const stroke = colors.carbon;
  const sw = 1.75;
  const common = { stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10.5" fill={fill} stroke={stroke} strokeWidth={sw} />
      {icon === 'job' && (
        <>
          <Rect x="5" y="8" width="14" height="10" rx="2" {...common} />
          <Path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" {...common} />
          <Line x1="5" y1="12" x2="19" y2="12" {...common} />
        </>
      )}
      {icon === 'food' && (
        <>
          <Path d="M7 4v6a2 2 0 0 0 4 0V4" {...common} />
          <Line x1="9" y1="12" x2="9" y2="20" {...common} />
          <Path d="M16 4c-1.5 1.5-1.5 4 0 5.5V20" {...common} />
        </>
      )}
      {icon === 'learning' && (
        <>
          <Path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v13.5H7.5A2.5 2.5 0 0 0 5 20Z" {...common} />
          <Path d="M5 20V6.5" {...common} />
          <Line x1="9" y1="8.5" x2="15" y2="8.5" {...common} />
          <Line x1="9" y1="12" x2="14" y2="12" {...common} />
        </>
      )}
      {icon === 'workout' && (
        <>
          <Path d="M6.5 6.5v11M17.5 6.5v11M6.5 9.5h11M4 8.5v7M20 8.5v7" {...common} />
        </>
      )}
      {icon === 'gaming' && (
        <>
          <Path d="M7 8h10a4 4 0 0 1 3.8 5.2l-.7 2A2.5 2.5 0 0 1 17.7 17h-1.4a2.5 2.5 0 0 1-2-1.2L13.5 14h-3l-.8 1.8a2.5 2.5 0 0 1-2 1.2H6.3a2.5 2.5 0 0 1-2.4-1.8l-.7-2A4 4 0 0 1 7 8Z" {...common} />
          <Line x1="8" y1="11" x2="10.5" y2="11" {...common} />
          <Line x1="9.25" y1="9.75" x2="9.25" y2="12.25" {...common} />
        </>
      )}
      {icon === 'journaling' && (
        <>
          <Path d="M5 19c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 5 0" {...common} />
          <Path d="M6 4.5h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" {...common} />
          <Line x1="9.5" y1="8.5" x2="14.5" y2="8.5" {...common} />
          <Line x1="9.5" y1="11.5" x2="13.5" y2="11.5" {...common} />
        </>
      )}
      {icon === 'sleep' && (
        <Path d="M19 13.5A7.5 7.5 0 1 1 10.5 5 6 6 0 0 0 19 13.5Z" {...common} />
      )}
      {icon === 'project' && (
        <>
          <Rect x="4.5" y="4.5" width="7" height="7" rx="1.5" {...common} />
          <Rect x="12.5" y="12.5" width="7" height="7" rx="1.5" {...common} />
          <Path d="M12 8v4a2 2 0 0 0 2 2h2" {...common} />
        </>
      )}
      {icon === 'study' && (
        <>
          <Path d="M12 4 4.5 7 12 10l7.5-3Z" {...common} />
          <Path d="M7 9.5V14a3 3 0 0 0 5 2.2M17 9.5V14" {...common} />
        </>
      )}
      {icon !== 'job' &&
        icon !== 'food' &&
        icon !== 'learning' &&
        icon !== 'workout' &&
        icon !== 'gaming' &&
        icon !== 'journaling' &&
        icon !== 'sleep' &&
        icon !== 'project' &&
        icon !== 'study' && (
          <Path d="M12 5.5 13.6 10l4.4 1.6-4.4 1.6L12 17.7 10.4 13.2 6 11.6l4.4-1.6Z" {...common} />
        )}
    </Svg>
  );
}
