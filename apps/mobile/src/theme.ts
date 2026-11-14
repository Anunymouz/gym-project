import { colors as brand, radii } from '@bgym/shared';

/** App-wide design tokens, built on the shared BGYM brand. */
export const colors = {
  ...brand,
  text: brand.midnight,
  textMuted: brand.mute,
  surface: brand.white,
  background: brand.cloud,
  border: brand.line,
  sidebarMuted: '#8A90B0',
  onDarkMuted: 'rgba(238,240,250,0.78)',
  flareSoft: '#FFF0EA',
  violetSoft: '#EEEBFF',
  successSoft: '#E7F7EC',
} as const;

/** Loaded in the root layout from @expo-google-fonts/outfit. */
export const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  extrabold: 'Outfit_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export { radii };
