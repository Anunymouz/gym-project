import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyBold' | 'small' | 'smallBold' | 'label';

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36 },
  title: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallBold: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.6, textTransform: 'uppercase' },
};

export function Text({ variant = 'body', muted, style, ...props }: TextProps & { variant?: Variant; muted?: boolean }) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[{ color: muted ? colors.textMuted : colors.text }, variants[variant], style]}
    />
  );
}
