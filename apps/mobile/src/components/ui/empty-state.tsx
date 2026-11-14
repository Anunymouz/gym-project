import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, space } from '@/theme';
import { Text } from './text';

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.box}>
      <View style={styles.icon}>{icon}</View>
      <Text variant="heading" style={styles.center}>{title}</Text>
      <Text muted style={styles.center}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, alignItems: 'center', gap: space.sm },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.flareSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  center: { textAlign: 'center' },
});
