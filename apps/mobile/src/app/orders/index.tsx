import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatGhs, ORDER_STATUS_LABELS, pesewas, type OrderSummary } from '@bgym/shared';
import { Header } from '@/components/header';
import { CheckCircleIcon, ReceiptIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { storeApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

export const STATUS_COLOR: Record<OrderSummary['status'], string> = {
  pending_payment: colors.textMuted, paid: colors.violet, preparing: colors.violet, ready_for_pickup: colors.violet, out_for_delivery: colors.flare, delivered: colors.success, delivery_failed: colors.danger, cancelled: colors.danger, refunded: colors.danger,
};

/** Me → My orders: every store order with its status. */
export default function Orders() {
  const { placed } = useLocalSearchParams<{ placed?: string }>();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => storeApi.orders().then(setOrders, () => setOrders([])), []);
  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="My orders" />
      <ScrollView contentContainerStyle={{ gap: space.md }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.flare} />}>
        {placed && (
          <Animated.View entering={FadeInDown} style={styles.placed}>
            <CheckCircleIcon size={26} color={colors.success} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">Order placed. Thank you!</Text>
              <Text variant="small" muted>We’ll let you know when it’s on the way.</Text>
            </View>
          </Animated.View>
        )}
        {!orders && [0, 1].map((i) => <Skeleton key={i} height={110} radius={radii.lg} />)}
        {orders?.length === 0 && <EmptyState icon={<ReceiptIcon size={28} color={colors.flare} weight="duotone" />} title="No orders yet" body="Supplements, equipment and apparel, delivered to you." action={<Button title="Browse the store" onPress={() => router.push('/store')} />} />}
        {orders?.map((o) => (
          <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Order ${o.number}, ${ORDER_STATUS_LABELS[o.status]}`} onPress={() => router.push({ pathname: '/orders/[id]', params: { id: o.id } })} style={styles.card}>
            <View style={{ flexDirection: 'row' }}>
              {o.items.slice(0, 3).map((i, n) => (
                <Image key={n} source={i.thumbUrl ? { uri: i.thumbUrl } : undefined} style={[styles.thumb, n > 0 && { marginLeft: -14 }]} contentFit="cover" />
              ))}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold">{o.number}</Text>
              <Text variant="small" muted numberOfLines={1}>{o.items.map((i) => i.title).join(', ')}</Text>
              <Text variant="smallBold" style={{ color: STATUS_COLOR[o.status] }}>{ORDER_STATUS_LABELS[o.status]}</Text>
            </View>
            <Text variant="bodyBold">{formatGhs(pesewas(o.totalPesewas))}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  placed: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.successSoft, borderRadius: radii.lg, padding: space.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  thumb: { width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderColor: colors.white, backgroundColor: colors.background },
});
