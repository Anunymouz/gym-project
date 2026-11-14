import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

/** Full-bleed photo card with a dark gradient so text stays readable on any image. */
export function PhotoHero({
  source,
  eyebrow,
  title,
  body,
  height = 260,
  children,
}: {
  source: ImageProps['source'];
  eyebrow?: string;
  title: string;
  body?: string;
  height?: number;
  children?: ReactNode;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(500)} style={[styles.card, { height }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityIgnoresInvertColors />
      <LinearGradient colors={['rgba(8,10,26,0.05)', 'rgba(8,10,26,0.55)', 'rgba(8,10,26,0.92)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        {eyebrow && <Text variant="label" style={{ color: colors.ember }}>{eyebrow}</Text>}
        <Text variant="title" style={{ color: colors.white }}>{title}</Text>
        {body && <Text style={{ color: colors.onDarkMuted }}>{body}</Text>}
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.midnight },
  content: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, gap: 6 },
});
