import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radii } from '@/theme';
import { Text } from './text';

type Variant = 'primary' | 'secondary' | 'dark' | 'black';

const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.flare, fg: colors.white },
  secondary: { bg: colors.white, fg: colors.midnight, border: colors.border },
  dark: { bg: colors.midnight, fg: colors.white },
  black: { bg: '#000000', fg: colors.white },
};

export function Button({
  title,
  variant = 'primary',
  icon,
  loading,
  disabled,
  onPress,
  ...props
}: Omit<PressableProps, 'children'> & { title: string; variant?: Variant; icon?: ReactNode; loading?: boolean }) {
  const p = palette[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(e) => {
        void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: p.bg, borderColor: p.border ?? p.bg, opacity: isDisabled ? 0.6 : pressed ? 0.88 : 1 },
        pressed && { transform: [{ scale: 0.985 }] },
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, { color: p.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 52, borderRadius: radii.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: fonts.bold, fontSize: 16 },
});
