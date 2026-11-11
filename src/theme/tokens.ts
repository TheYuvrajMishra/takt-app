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

/**
 * Shadows: carbon-tinted, never grey. A card takes ONE balanced shadow
 * (`card`) — the old two-shadow nesting (a large ambient on an outer
 * shell plus a tight contact on an inner shell, same fill) drew a dark
 * line just inside the card edge and let the inner shell shrink-wrap to
 * half width. Smaller surfaces (chips, pills, blocks at rest) take a
 * single soft one.
 */
export const shadows = {
  /** One balanced shadow for a card: reads as lift, no inner dark line. */
  card: {
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  /** Single soft shadow for small surfaces at rest (blocks, pills). */
  soft: {
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 2,
  },
  /** Lifted while dragged / pressed: stronger, higher. */
  lifted: {
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

export const spacing = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

// Hairline only: carbon at low opacity. Never a grey fill/text.
export const hairline = 'rgba(10,10,10,0.12)';
export const faintText = 'rgba(10,10,10,0.55)';

export const fonts = {
  regular: 'InterTight-Regular',
  medium: 'InterTight-Medium',
  semibold: 'InterTight-SemiBold',
} as const;

/**
 * Tracking (letter-spacing): display headings run tight so they read as
 * one wordmark, small-caps labels run wide so they read as a label.
 * Body copy stays at 0 — tracking on body text hurts readability.
 */
export const tracking = { tight: -0.5, normal: 0, wide: 3 } as const;

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
