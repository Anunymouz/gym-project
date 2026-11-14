import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeftIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme';

export function Header({ title, right, back }: { title: string; right?: ReactNode; back?: boolean }) {
  return (
    <View style={styles.row}>
      {back && (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeftIcon size={22} color={colors.text} />
        </Pressable>
      )}
      <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

export function IconButton({ label, children, onPress }: { label: string; children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconBtn} hitSlop={6}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  iconBtn: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
