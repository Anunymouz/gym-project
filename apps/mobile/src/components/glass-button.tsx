import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

const liquid = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Small glass control for use over photos (Liquid Glass on iOS 26, frosted blur elsewhere). */
export function GlassButton({ label, onPress, children, wide }: { label: string; onPress: () => void; children: ReactNode; wide?: boolean }) {
  const inner = <View style={[styles.inner, wide && styles.wide]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.shape, wide && styles.wideShape, pressed && { opacity: 0.85 }]}>
      {liquid ? (
        <GlassView glassEffectStyle="regular" isInteractive style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <BlurView intensity={50} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.7)' }]} />
        </>
      )}
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shape: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden' },
  wideShape: { width: 'auto', paddingHorizontal: 14 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wide: { flexDirection: 'row', gap: 6 },
});
