/**
 * BGYM brand tokens. Source of truth: brand/README.md.
 * Web (Tailwind theme) and mobile (React Native theme) both read from here.
 */
export const colors = {
  midnight: '#0D1028',
  night: '#080A1A',
  indigo: '#231B5E',
  flare: '#FF5A1F',
  ember: '#FF8A3D',
  violet: '#6C5CE7',
  cloud: '#F5F6FA',
  white: '#FFFFFF',
  line: '#E6E8F0',
  mute: '#6B7280',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#F59E0B',
} as const;

export type BrandColor = keyof typeof colors;

export const fonts = {
  family: 'Outfit',
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
} as const;

export const radii = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const brand = {
  name: 'BGYM',
  tagline: 'Be my gym buddy.',
} as const;
