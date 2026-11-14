import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ShoppingBagIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { useTabBarSpace } from '@/components/tab-bar';
import { colors, radii, space } from '@/theme';

/** Floating "BGYM Store" bar shown above the tab bar: shopping never requires joining a gym. */
export const STORE_BAR_HEIGHT = 72;

export function StoreBar() {
  const tabSpace = useTabBarSpace();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open the BGYM Store" onPress={() => router.push('/store')} style={({ pressed }) => [styles.bar, { bottom: tabSpace - 4 }, pressed && { opacity: 0.92 }]}>
      <View style={styles.icon}>
        <ShoppingBagIcon size={22} color={colors.white} weight="fill" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyBold" style={{ color: colors.white }}>BGYM Store</Text>
        <Text variant="small" style={{ color: colors.onDarkMuted }}>Supplements, apparel & equipment</Text>
      </View>
      <View style={styles.cta}>
        <Text variant="smallBold">Shop</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.midnight, borderRadius: radii.lg, padding: space.md,
    shadowColor: colors.midnight, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.flare, alignItems: 'center', justifyContent: 'center' },
  cta: { backgroundColor: colors.white, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 7 },
});
