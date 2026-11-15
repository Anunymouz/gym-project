import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { formatGhs, ORDER_STATUS_LABELS, pesewas, type OrderStatus, type OrderSummary } from '@bgym/shared';
import { Header } from '@/components/header';
import { MapPinIcon, MopedIcon, PhoneIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { storeApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';
import { STATUS_COLOR } from './index';

const ghs = (p: number) => formatGhs(pesewas(p));
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Accra' });
const STEPS: OrderStatus[] = ['paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

/** One order: where it is, who's bringing it, what's in it. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [o, setO] = useState<OrderSummary | null>(null);
  useFocusEffect(useCallback(() => void storeApi.order(id).then(setO, () => undefined), [id]));

  const cancel = () =>
    Alert.alert(`Cancel ${o?.number}?`, 'You’ll get a full refund to the account you paid with.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => void storeApi.cancelOrder(id).then(setO, (e: unknown) => Alert.alert('Couldn’t cancel', e instanceof Error ? e.message : 'Try again.')) },
    ]);

  if (!o) return <Screen scroll edges={['top', 'bottom']}><Header back title="Order" /><Skeleton height={240} radius={radii.lg} /></Screen>;
  const stopped = ['cancelled', 'refunded', 'delivery_failed'].includes(o.status);
  const reached = new Set(o.events.map((e) => e.status));
  const at = (s: OrderStatus) => o.events.find((e) => e.status === s)?.at;

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: space.lg }}>
      <Header back title={o.number} />
      <View style={styles.card}>
        <Text variant="heading" style={{ color: STATUS_COLOR[o.status] }}>{ORDER_STATUS_LABELS[o.status]}</Text>
        {o.refundDue && <Text variant="small" muted>Your refund is on its way to the account you paid with (usually within a few days).</Text>}
        {!stopped && (
          <View style={{ gap: 0, marginTop: space.sm }}>
            {STEPS.map((s, i) => {
              const done = reached.has(s);
              return (
                <View key={s} style={{ flexDirection: 'row', gap: space.md }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.dot, done && styles.dotDone]} />
                    {i < STEPS.length - 1 && <View style={[styles.lineV, reached.has(STEPS[i + 1]!) && { backgroundColor: colors.success }]} />}
                  </View>
                  <View style={{ paddingBottom: space.md, flex: 1 }}>
                    <Text variant={done ? 'bodyBold' : 'body'} muted={!done}>{ORDER_STATUS_LABELS[s]}</Text>
                    {at(s) && <Text variant="small" muted>{when(at(s)!)}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {o.delivery?.courierName && (
          <View style={styles.rider}>
            <MopedIcon size={24} color={colors.flare} weight="duotone" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">{o.delivery.courierName}</Text>
              <Text variant="small" muted>Your rider</Text>
            </View>
            {o.delivery.courierPhone && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Call ${o.delivery.courierName}`} onPress={() => void Linking.openURL(`tel:${o.delivery!.courierPhone}`)} style={styles.call}>
                <PhoneIcon size={18} color={colors.white} weight="fill" />
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text variant="bodyBold">From {o.seller}</Text>
        {o.items.map((i, n) => (
          <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Image source={i.thumbUrl ? { uri: i.thumbUrl } : undefined} style={styles.thumb} contentFit="cover" />
            <Text style={{ flex: 1 }}><Text variant="bodyBold">{i.quantity} ×</Text> {i.title}</Text>
            <Text variant="bodyBold">{ghs(i.unitPricePesewas * i.quantity)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.row}><Text muted>Items</Text><Text>{ghs(o.subtotalPesewas)}</Text></View>
        <View style={styles.row}><Text muted>Delivery</Text><Text>{ghs(o.deliveryFeePesewas)}</Text></View>
        <View style={styles.row}><Text variant="bodyBold">Total</Text><Text variant="heading">{ghs(o.totalPesewas)}</Text></View>
      </View>

      <View style={[styles.card, { flexDirection: 'row', gap: space.md }]}>
        <MapPinIcon size={22} color={colors.flare} weight="fill" />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">Delivering to</Text>
          <Text variant="small" muted>{o.address.addressText}{o.address.landmark ? ` · ${o.address.landmark}` : ''}</Text>
          <Text variant="small" muted>{o.address.contactPhone}</Text>
        </View>
      </View>

      {o.status === 'paid' && (
        <Pressable accessibilityRole="button" onPress={cancel} style={{ alignSelf: 'center', padding: space.sm }}>
          <Text variant="bodyBold" style={{ color: colors.danger }}>Cancel order</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, marginTop: 3 },
  dotDone: { borderColor: colors.success, backgroundColor: colors.success },
  lineV: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  rider: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.flareSoft, borderRadius: radii.md, padding: space.md },
  call: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flare, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.background },
  divider: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
