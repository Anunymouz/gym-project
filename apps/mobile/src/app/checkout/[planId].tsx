import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { formatGhs, pesewas, planPeriodLabel, type CheckoutResponse, type GymDetail } from '@bgym/shared';
import { Header } from '@/components/header';
import { CreditCardIcon, DeviceMobileIcon, ShieldCheckIcon } from '@/components/icons';
import { OrbitLoader } from '@/components/motion/orbit-loader';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { DevPaymentSheet } from '@/components/payment/dev-payment-sheet';
import { fetchGym, membershipsApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, radii, space } from '@/theme';
import { Image } from 'expo-image';

type Phase = 'review' | 'starting' | 'awaiting' | 'confirming' | 'failed';

export default function Checkout() {
  const { planId, gym: slug } = useLocalSearchParams<{ planId: string; gym: string }>();
  const { user } = useSession();
  const [gym, setGym] = useState<GymDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('review');
  const [error, setError] = useState<string | null>(null);
  const [devPayment, setDevPayment] = useState<CheckoutResponse | null>(null);

  useEffect(() => {
    fetchGym(slug).then(setGym).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
  }, [slug]);
  const plan = gym?.plans.find((p) => p.id === planId);

  /** Polls until the payment is confirmed by the server (webhook), then opens the membership. */
  async function waitForConfirmation(reference: string) {
    setPhase('confirming');
    for (let i = 0; i < 30; i++) {
      const s = await membershipsApi.paymentStatus(reference).catch(() => null);
      if (s?.status === 'success' && s.membershipId) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({ pathname: '/membership/[id]', params: { id: s.membershipId, welcome: '1' } });
        return;
      }
      if (s?.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    setPhase('failed');
    setError("We haven't received confirmation of your payment yet. If you were charged, your membership will appear in Me → My memberships shortly.");
  }

  async function pay() {
    if (!plan) return;
    setError(null);
    setPhase('starting');
    try {
      const checkout = await membershipsApi.checkout(plan.id);
      if (checkout.provider === 'dev') {
        setDevPayment(checkout);
        setPhase('awaiting');
        return;
      }
      setPhase('awaiting');
      await WebBrowser.openAuthSessionAsync(checkout.authorizationUrl!, 'bgym://payments/complete');
      await waitForConfirmation(checkout.reference);
    } catch (e) {
      setPhase('failed');
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  async function approveDevPayment() {
    if (!devPayment) return;
    setDevPayment(null);
    try {
      await membershipsApi.simulatePayment(devPayment.reference);
      await waitForConfirmation(devPayment.reference);
    } catch (e) {
      setPhase('failed');
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const busy = phase === 'starting' || phase === 'awaiting' || phase === 'confirming';

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ flexGrow: 1, gap: space.lg }}>
      <Header back title="Checkout" />

      {gym && plan && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.summary}>
          <Image source={gym.coverUrl ? { uri: gym.coverUrl } : undefined} style={styles.thumb} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="small" muted>Membership</Text>
            <Text variant="bodyBold">{gym.name}</Text>
            <Text variant="small" muted>{plan.name} · {planPeriodLabel(plan.durationDays)}</Text>
          </View>
          <Text variant="heading">{formatGhs(pesewas(plan.pricePesewas))}</Text>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ gap: space.sm }}>
        <Text variant="bodyBold">How you’ll pay</Text>
        <View style={styles.method}>
          <View style={styles.methodIcon}><DeviceMobileIcon size={22} color={colors.flare} weight="duotone" /></View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">Mobile Money</Text>
            <Text variant="small" muted>MTN MoMo, Telecel Cash or AT Money: approve the prompt on your phone</Text>
          </View>
        </View>
        <View style={styles.method}>
          <View style={styles.methodIcon}><CreditCardIcon size={22} color={colors.violet} weight="duotone" /></View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">Debit or credit card</Text>
            <Text variant="small" muted>Visa, Mastercard and Verve</Text>
          </View>
        </View>
        <Text variant="small" muted>You’ll choose on Paystack’s secure payment page. BGYM never sees your card or MoMo PIN.</Text>
      </Animated.View>

      <View style={{ marginTop: 'auto', gap: space.sm }}>
        {phase === 'confirming' && (
          <Animated.View entering={FadeIn} style={styles.confirming}>
            <OrbitLoader size={36} />
            <Text variant="bodyBold">Confirming your payment…</Text>
          </Animated.View>
        )}
        {error && <Text variant="smallBold" style={{ color: phase === 'failed' ? colors.danger : colors.text }}>{error}</Text>}
        {plan && (
          <>
            <View style={styles.totalRow}>
              <Text muted>Total</Text>
              <Text variant="title">{formatGhs(pesewas(plan.pricePesewas))}</Text>
            </View>
            <Button title={`Pay ${formatGhs(pesewas(plan.pricePesewas))}`} loading={busy} onPress={() => void pay()} />
          </>
        )}
        <View style={styles.secure}>
          <ShieldCheckIcon size={16} color={colors.success} weight="fill" />
          <Text variant="small" muted>Secured by Paystack</Text>
        </View>
      </View>

      <DevPaymentSheet
        checkout={devPayment}
        email={user?.email ?? ''}
        onApprove={() => void approveDevPayment()}
        onCancel={() => {
          setDevPayment(null);
          setPhase('review');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  thumb: { width: 60, height: 60, borderRadius: 14, backgroundColor: colors.midnight },
  method: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  methodIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  confirming: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
