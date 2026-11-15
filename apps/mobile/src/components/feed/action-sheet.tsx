import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

export interface SheetAction {
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  onPress: () => void;
}

/** A simple bottom sheet of actions (the ⋯ menu on posts, comments and stories). */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.grab} />
        {title && <Text variant="smallBold" muted style={{ textAlign: 'center', marginBottom: space.sm }}>{title}</Text>}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
          >
            {a.icon}
            <Text variant="bodyBold" style={a.destructive ? { color: colors.danger } : undefined}>{a.label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.row, styles.cancel]}>
          <Text variant="bodyBold" style={{ flex: 1, textAlign: 'center' }}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,10,26,0.5)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: space.lg, paddingTop: space.sm },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.md, borderRadius: radii.md },
  cancel: { marginTop: space.sm, backgroundColor: colors.background },
});
