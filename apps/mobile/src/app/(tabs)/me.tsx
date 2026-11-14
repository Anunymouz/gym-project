import { Pressable, StyleSheet, View } from 'react-native';
import type { ComponentType } from 'react';
import type { IconProps } from 'phosphor-react-native';
import { Header } from '@/components/header';
import { CaretRightIcon, MapPinIcon, QrCodeIcon, ReceiptIcon, ShoppingBagIcon, UserCircleIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { colors, radii, space } from '@/theme';

const rows: { label: string; detail: string; Icon: ComponentType<IconProps> }[] = [
  { label: 'My memberships', detail: 'QR codes and renewals', Icon: QrCodeIcon },
  { label: 'My bookings', detail: 'Trainer sessions', Icon: UserCircleIcon },
  { label: 'My orders', detail: 'Store orders and delivery', Icon: ShoppingBagIcon },
  { label: 'Payments & receipts', detail: 'MoMo and card', Icon: ReceiptIcon },
  { label: 'Search area', detail: '', Icon: MapPinIcon },
];

export default function Me() {
  const { email, area, signOut } = useSession();
  return (
    <Screen scroll>
      <Header title="Me" />
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text variant="heading" style={{ color: colors.violet }}>{email?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{email}</Text>
          <Text variant="small" muted>Member</Text>
        </View>
      </View>
      <View style={styles.list}>
        {rows.map(({ label, detail, Icon }, i) => (
          <Pressable key={label} accessibilityRole="button" style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
            <View style={styles.rowIcon}><Icon size={19} color={colors.text} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">{label}</Text>
              <Text variant="small" muted>{label === 'Search area' ? `${area?.label} · ${area?.radiusKm} km` : detail}</Text>
            </View>
            <CaretRightIcon size={18} color="#9AA0B4" />
          </Pressable>
        ))}
      </View>
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  list: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
