import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { formatGhs, pesewas, type CheckoutQuote, type SavedAddress } from '@bgym/shared';
import { Header } from '@/components/header';
import { CheckCircleIcon, MapPinLineIcon, PlusIcon, ShieldCheckIcon, TruckIcon } from '@/components/icons';
import { DevPaymentSheet } from '@/components/payment/dev-payment-sheet';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { storeApi } from '@/lib/api';
import { cartStore } from '@/lib/cart-store';
import { useSession } from '@/lib/session';
import { usePayment } from '@/lib/use-payment';
import { colors, fonts, radii, space } from '@/theme';

const ghs = (p: number) => formatGhs(pesewas(p));

/** Where to deliver, what it costs (per seller), then pay once. */
export default function Checkout() {
  const { user } = useSession();
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pay, confirming, devSheet } = usePayment();

  const choose = useCallback(async (id: string) => {
    setAddressId(id);
    setQuoting(true);
    setError(null);
    try {
      setQuote(await storeApi.quote(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t work out delivery.');
    } finally {
      setQuoting(false);
    }
  }, []);

  // Reload when coming back from adding an address.
  useFocusEffect(
    useCallback(() => {
      storeApi.addresses().then((list) => {
        setAddresses(list);
        const keep = list.find((a) => a.id === addressId) ?? list[0];
        if (keep) void choose(keep.id);
      }, () => setAddresses([]));
    }, [addressId, choose]),
  );

  const placeOrder = async () => {
    if (!addressId || !quote || quote.problem) return;
    setBusy(true);
    setError(null);
    try {
      const res = await storeApi.checkout(addressId, note.trim() || undefined);
      const outcome = await pay({ reference: res.reference, amountPesewas: res.amountPesewas, provider: res.provider, authorizationUrl: res.authorizationUrl });
      if (outcome === 'cancelled') {
        setError('Payment cancelled. Your items are held for 15 minutes if you want to try again.');
        return;
      }
      await cartStore.refresh();
      if (outcome === 'unconfirmed') {
        setError('We haven’t had confirmation of your payment yet. If you were charged, your order will appear in My orders shortly.');
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/orders', params: { placed: res.orderIds.length > 1 ? 'many' : res.orderIds[0] } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t place the order.');
      if (addressId) void choose(addressId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: space.lg }}>
      <Header back title="Checkout" />
      <View style={{ gap: space.sm }}>
        <Text variant="bodyBold">Deliver to</Text>
        {!addresses && <ActivityIndicator color={colors.flare} />}
        {addresses?.map((a) => {
          const on = a.id === addressId;
          return (
            <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => void choose(a.id)} onLongPress={() => router.push({ pathname: '/store/address', params: { id: a.id } })} style={[styles.address, on && styles.addressOn]}>
              <MapPinLineIcon size={22} color={on ? colors.flare : colors.textMuted} weight={on ? 'fill' : 'regular'} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{a.label ?? 'Address'}</Text>
                <Text variant="small" muted numberOfLines={2}>{a.addressText}{a.landmark ? ` · ${a.landmark}` : ''}</Text>
                <Text variant="small" muted>{a.contactPhone}</Text>
              </View>
              {on && <CheckCircleIcon size={20} color={colors.flare} weight="fill" />}
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => router.push('/store/address')} style={styles.add}>
          <PlusIcon size={18} color={colors.flare} weight="bold" />
          <Text variant="bodyBold" style={{ color: colors.flare }}>{addresses?.length ? 'Add another address' : 'Add your delivery address'}</Text>
        </Pressable>
      </View>

      {quote && (
        <View style={styles.summary}>
          {quote.orders.map((o, i) => (
            <View key={i} style={{ gap: 4 }}>
              {quote.orders.length > 1 && <Text variant="smallBold">{o.seller}</Text>}
              <Row label={`Items (${o.lines})`} value={ghs(o.subtotalPesewas)} />
              <Row label={`Delivery · ${o.distanceKm} km`} value={ghs(o.deliveryFeePesewas)} icon={<TruckIcon size={16} color={colors.textMuted} />} />
            </View>
          ))}
          <View style={styles.divider} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="bodyBold">Total</Text>
            <Text variant="title">{ghs(quote.totalPesewas)}</Text>
          </View>
          {quote.orders.length > 1 && <Text variant="small" muted>{quote.orders.length} sellers, so {quote.orders.length} deliveries. You pay once.</Text>}
        </View>
      )}
      {quoting && <ActivityIndicator color={colors.flare} />}

      <TextInput value={note} onChangeText={setNote} maxLength={300} placeholder="Note for the seller or rider (optional)" placeholderTextColor={colors.textMuted} multiline style={styles.note} accessibilityLabel="Note for the seller or rider" />

      <View style={{ gap: space.sm, marginTop: 'auto' }}>
        {(quote?.problem || error) && <Text variant="smallBold" style={{ color: colors.danger }} accessibilityRole="alert">{quote?.problem ?? error}</Text>}
        <Button title={confirming ? 'Confirming payment…' : quote ? `Pay ${ghs(quote.totalPesewas)}` : 'Pay'} disabled={!quote || !!quote.problem || quoting} loading={busy || confirming} onPress={() => void placeOrder()} />
        <View style={styles.secure}><ShieldCheckIcon size={16} color={colors.success} weight="fill" /><Text variant="small" muted>Mobile Money or card, secured by Paystack</Text></View>
      </View>
      <DevPaymentSheet checkout={devSheet.checkout} email={user?.email ?? ''} onApprove={devSheet.onApprove} onCancel={devSheet.onCancel} />
    </Screen>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{icon}<Text muted>{label}</Text></View>
      <Text variant="bodyBold">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  address: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, padding: space.md },
  addressOn: { borderColor: colors.flare },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm },
  summary: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  divider: { height: 1, backgroundColor: colors.border },
  note: { minHeight: 56, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: space.md, fontFamily: fonts.regular, fontSize: 15, color: colors.text, textAlignVertical: 'top' },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
