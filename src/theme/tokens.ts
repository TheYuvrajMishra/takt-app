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
