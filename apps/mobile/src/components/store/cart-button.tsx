import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { IconButton } from '@/components/header';
import { ShoppingBagIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { useCart } from '@/lib/cart-store';
import { colors } from '@/theme';

/** Cart icon with the number of items. */
export function CartButton() {
  const cart = useCart();
  const count = cart?.count ?? 0;
  return (
    <IconButton label={count ? `Cart, ${count} item${count > 1 ? 's' : ''}` : 'Cart'} onPress={() => router.push('/store/cart')}>
      <ShoppingBagIcon size={21} color={colors.text} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </IconButton>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.flare, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: colors.background },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
});
