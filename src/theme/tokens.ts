// Takt — design tokens. Single source of truth. NO grey token exists by design.
export const colors = {
  carbon: '#0A0A0A',
  cloud: '#F6F5F2',
  paper: '#FFFFFF',
  butter: '#F8E39A',
  mint: '#4BBF8F',
  violet: '#6A57C0',
  orchid: '#C0468F',
  apricot: '#F4A261',
} as const;

export type CategoryColorName = 'butter' | 'mint' | 'violet' | 'orchid' | 'apricot' | 'carbon';
export const categoryColorHex: Record<CategoryColorName, string> = {
  butter: colors.butter,
  mint: colors.mint,
  violet: colors.violet,
  orchid: colors.orchid,
  apricot: colors.apricot,
  carbon: colors.carbon,
};

// Status colors
export const statusColors = {
  complete: colors.mint,
  progress: colors.apricot,
  missed: colors.carbon,
  upcoming: colors.cloud, // hatched cloud
} as const;

export const radii = { card: 32, cardSm: 28, pill: 999, sheet: 36 } as const;

export const spacing = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

// Hairline only: carbon at low opacity. Never a grey fill/text.
export const hairline = 'rgba(10,10,10,0.12)';
export const faintText = 'rgba(10,10,10,0.55)';

export const fonts = {
  regular: 'InterTight-Regular',
  medium: 'InterTight-Medium',
  semibold: 'InterTight-SemiBold',
} as const;

// Large-text setting: body text scales by this factor (see components/TText).
export const LARGE_TEXT_SCALE = 1.18;
export function scaledFontSize(size: number, largeText: boolean): number {
  return largeText ? Math.round(size * LARGE_TEXT_SCALE) : size;
}

// Colour-blind-safe category identity: every category gets a distinct
// hatch pattern IN ADDITION to its color, so identity never depends on
// hue alone. Used by the Stats heatmap's colored-cell mode (cells have no
// icon) and anywhere a category appears as a bare color fill.
export type PatternKind = 'diag' | 'diag-rev' | 'horiz' | 'vert' | 'dots' | 'cross';
export const categoryPattern: Record<CategoryColorName, PatternKind> = {
  butter: 'diag',
  mint: 'diag-rev',
  violet: 'horiz',
  orchid: 'vert',
  apricot: 'dots',
  carbon: 'cross',
};

/**
 * Per-category overrides: several default categories share a colour
 * (Job/Sleep carbon, Learning/Project violet, Gaming/Study butter,
 * Food/Custom apricot), so the colour's pattern alone cannot tell them
 * apart. These make every default category's (colour, pattern) pair
 * unique. Custom categories fall back to their colour's pattern — two
 * customs sharing a colour can still collide, which is acceptable.
 */
export const categoryPatternById: Record<string, PatternKind> = {
  'cat-job': 'cross',
  'cat-sleep': 'dots',
  'cat-learning': 'horiz',
  'cat-project': 'vert',
  'cat-gaming': 'diag',
  'cat-study': 'diag-rev',
  'cat-food': 'dots',
  'cat-custom': 'horiz',
  'cat-workout': 'vert',
  'cat-journaling': 'diag-rev',
};

export function patternForCategory(category: {
  id: string;
  color: CategoryColorName;
}): PatternKind {
  return categoryPatternById[category.id] ?? categoryPattern[category.color];
}
