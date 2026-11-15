import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { formatGhs, pesewas, type CartLine } from '@bgym/shared';
import { Header } from '@/components/header';
import { MinusIcon, PlusIcon, ShoppingBagIcon, TrashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { cartStore, useCart } from '@/lib/cart-store';
import { colors, radii, space } from '@/theme';

const ghs = (p: number) => formatGhs(pesewas(p));

/** The cart, grouped by seller (each seller delivers separately). */
export default function CartScreen() {
  const cart = useCart();
  const sellers = cart ? [...new Map(cart.lines.map((l) => [l.seller.id, l.seller.name])).entries()] : [];
  const problem = cart?.lines.find((l) => l.available < l.quantity);

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: space.lg }}>
      <Header back title="Your cart" />
      {!cart && [0, 1].map((i) => <Skeleton key={i} height={96} radius={radii.lg} />)}
      {cart && cart.lines.length === 0 && (
        <EmptyState icon={<ShoppingBagIcon size={28} color={colors.flare} weight="duotone" />} title="Your cart is empty" body="Protein, equipment, apparel and more, delivered to you." action={<Button title="Browse the store" onPress={() => router.replace('/store')} />} />
      )}
      {sellers.map(([id, name]) => (
        <View key={id} style={{ gap: space.sm }}>
          {sellers.length > 1 && <Text variant="label" muted>From {name}</Text>}
          {cart!.lines.filter((l) => l.seller.id === id).map((l) => <Line key={l.variantId} line={l} />)}
        </View>
      ))}
      {cart && cart.lines.length > 0 && (
        <View style={{ gap: space.md, marginTop: 'auto' }}>
          {sellers.length > 1 && <Text variant="small" muted>Your items come from {sellers.length} sellers, so they arrive as {sellers.length} deliveries. You pay once.</Text>}
          <View style={styles.total}>
            <Text muted>Subtotal ({cart.count} item{cart.count === 1 ? '' : 's'})</Text>
            <Text variant="title">{ghs(cart.subtotalPesewas)}</Text>
          </View>
          <Text variant="small" muted>Delivery is added at checkout, based on where you are.</Text>
          {problem && <Text variant="smallBold" style={{ color: colors.danger }}>{problem.available === 0 ? `${problem.title} is sold out. Remove it to continue.` : `Only ${problem.available} of ${problem.title} left. Lower the quantity to continue.`}</Text>}
          <Button title="Checkout" disabled={!!problem} onPress={() => router.push('/store/checkout')} />
        </View>
      )}
    </Screen>
  );
}

function Line({ line: l }: { line: CartLine }) {
  const set = (q: number) => void cartStore.setLine(l.variantId, q).catch(() => undefined);
  const short = l.available < l.quantity;
  return (
    <View style={[styles.line, short && { borderColor: colors.danger }]}>
      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/store/product/[id]', params: { id: l.productId } })}>
        <Image source={l.thumbUrl ? { uri: l.thumbUrl } : undefined} style={styles.thumb} contentFit="cover" />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyBold" numberOfLines={2}>{l.title}</Text>
        <Text variant="small" muted>{l.variantName}</Text>
        <Text variant="bodyBold">{ghs(l.unitPricePesewas * l.quantity)}</Text>
        {short && <Text variant="smallBold" style={{ color: colors.danger }}>{l.available === 0 ? 'Sold out' : `Only ${l.available} left`}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.title}`} onPress={() => set(0)} hitSlop={8}><TrashIcon size={18} color={colors.textMuted} /></Pressable>
        <View style={styles.qty}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fewer" onPress={() => set(l.quantity - 1)} style={styles.qtyBtn}><MinusIcon size={14} color={colors.text} weight="bold" /></Pressable>
          <Text variant="bodyBold" style={{ minWidth: 18, textAlign: 'center' }}>{l.quantity}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={l.quantity >= l.available} onPress={() => set(l.quantity + 1)} style={[styles.qtyBtn, l.quantity >= l.available && { opacity: 0.35 }]}><PlusIcon size={14} color={colors.text} weight="bold" /></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: radii.md, backgroundColor: colors.background },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 3 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
