import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatGhs, pesewas, type TrainerDetail, type TrainerPackageItem } from '@bgym/shared';
import { GlassButton } from '@/components/glass-button';
import { ArrowLeftIcon, CertificateIcon, ClockIcon, MapPinIcon, PackageIcon, ShieldCheckIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { DevPaymentSheet } from '@/components/payment/dev-payment-sheet';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { trainersApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { usePayment } from '@/lib/use-payment';
import { colors, radii, space } from '@/theme';

const ghs = (p: number) => formatGhs(pesewas(p));
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** A trainer's profile: who they are, prices and packages, and the way to book. */
export default function TrainerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [t, setT] = useState<TrainerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const { pay, confirming, devSheet } = usePayment();

  const load = useCallback(() => trainersApi.detail(id).then(setT, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load this trainer.')), [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const buy = (p: TrainerPackageItem) =>
    Alert.alert(`Buy “${p.name}”?`, `${p.sessionsCount} sessions with ${t?.name} for ${ghs(p.pricePesewas)}. Book them any time in the next ${p.validityDays} days.`, [
      { text: 'Not now', style: 'cancel' },
      {
        text: `Pay ${ghs(p.pricePesewas)}`,
        onPress: async () => {
          setBuying(p.id);
          try {
            const checkout = await trainersApi.buyPackage(p.id);
            const outcome = await pay({ reference: checkout.reference!, amountPesewas: checkout.amountPesewas, provider: checkout.provider!, authorizationUrl: checkout.authorizationUrl });
            if (outcome === 'paid') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
              Alert.alert('Package ready', `You have ${p.sessionsCount} sessions with ${t?.name}. Book your first one now.`, [{ text: 'Book a session', onPress: () => router.push({ pathname: '/book/[trainerId]', params: { trainerId: id } }) }, { text: 'Later' }]);
            } else if (outcome === 'unconfirmed') {
              Alert.alert('Still confirming', 'We haven’t had confirmation of your payment yet. If you were charged, your package will appear here shortly.');
            }
          } catch (e) {
            Alert.alert('Couldn’t start the payment', e instanceof Error ? e.message : 'Try again.');
          } finally {
            setBuying(null);
          }
        },
      },
    ]);

  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60, padding: space.lg }]}>
        <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Trainer not available" body={error} action={<Button title="Back" variant="dark" onPress={() => router.back()} />} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {t ? (
          <Image source={t.photoUrl ? { uri: t.photoUrl } : undefined} style={styles.hero} contentFit="cover" transition={250} accessibilityLabel={`Photo of ${t.name}`} />
        ) : (
          <Skeleton height={380} radius={0} />
        )}
        <View style={styles.body}>
          {!t ? (
            <View style={{ gap: space.md }}><Skeleton width="60%" height={28} /><Skeleton height={90} /></View>
          ) : (
            <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space.lg }}>
              <View style={{ gap: 6 }}>
                <Text variant="display">{t.name}</Text>
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/gym/[slug]', params: { slug: t.gym.slug } })} style={styles.row}>
                  <MapPinIcon size={16} color={colors.flare} weight="fill" />
                  <Text variant="bodyBold" style={{ color: colors.flare }}>{t.gym.name}</Text>
                </Pressable>
                <View style={styles.tags}>
                  {t.specialties.map((s) => <View key={s} style={styles.tag}><Text variant="smallBold">{s}</Text></View>)}
                </View>
              </View>

              <View style={styles.priceCard}>
                <View style={{ flex: 1 }}>
                  <Text variant="small" muted>Single session</Text>
                  <Text variant="title">{ghs(t.sessionPricePesewas)}</Text>
                </View>
                <View style={styles.row}><ClockIcon size={18} color={colors.textMuted} /><Text variant="bodyBold">{t.sessionDurationMin} min</Text></View>
              </View>

              {t.myPackages.length > 0 && (
                <View style={styles.myPkg}>
                  <PackageIcon size={22} color={colors.success} weight="duotone" />
                  <View style={{ flex: 1 }}>
                    {t.myPackages.map((p) => (
                      <Text key={p.id} variant="bodyBold">{p.sessionsRemaining} of {p.sessionsCount} sessions left · until {date(p.endsAt)}</Text>
                    ))}
                    <Text variant="small" muted>Booking with your package is free.</Text>
                  </View>
                </View>
              )}

              <View style={{ gap: space.sm }}>
                <Text variant="heading">About</Text>
                <Text style={{ lineHeight: 23 }}>{t.bio}</Text>
              </View>

              {t.certifications.length > 0 && (
                <View style={{ gap: space.sm }}>
                  <Text variant="heading">Qualifications</Text>
                  {t.certifications.map((c) => (
                    <View key={c} style={styles.row}><CertificateIcon size={18} color={colors.violet} weight="duotone" /><Text>{c}</Text></View>
                  ))}
                </View>
              )}

              {t.packages.length > 0 && (
                <View style={{ gap: space.sm }}>
                  <Text variant="heading">Coaching packages</Text>
                  {t.packages.map((p) => {
                    const per = Math.round(p.pricePesewas / p.sessionsCount);
                    const save = t.sessionPricePesewas > per ? Math.round((1 - per / t.sessionPricePesewas) * 100) : 0;
                    return (
                      <View key={p.id} style={styles.pkg}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="bodyBold">{p.name}</Text>
                          <Text variant="small" muted>{p.sessionsCount} sessions · use within {p.validityDays} days · {ghs(per)} each</Text>
                          {p.description && <Text variant="small">{p.description}</Text>}
                          {save > 0 && <Text variant="smallBold" style={{ color: colors.success }}>Save {save}%</Text>}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text variant="heading">{ghs(p.pricePesewas)}</Text>
                          <Button title="Buy" variant="dark" loading={buying === p.id} disabled={buying !== null} onPress={() => buy(p)} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.policy}>
                <ShieldCheckIcon size={18} color={colors.success} weight="fill" />
                <Text variant="small" muted style={{ flex: 1 }}>Free cancellation until {t.cancelHours} hours before a session: you get your money back, or the session back on your package. Paid securely with Paystack.</Text>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <GlassButton label="Back" onPress={() => router.back()}><ArrowLeftIcon size={20} color={colors.text} /></GlassButton>
      </View>

      {t && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <View style={{ flex: 1 }}>
            <Text variant="small" muted>{t.myPackages.length ? 'With your package' : `${t.sessionDurationMin} min session`}</Text>
            <Text variant="heading">{t.myPackages.length ? 'Free' : ghs(t.sessionPricePesewas)}</Text>
          </View>
          <View style={{ flex: 1.3 }}>
            <Button title={confirming ? 'Confirming…' : 'Book a session'} loading={confirming} onPress={() => router.push({ pathname: '/book/[trainerId]', params: { trainerId: id } })} />
          </View>
        </View>
      )}
      <DevPaymentSheet checkout={devSheet.checkout} email={user?.email ?? ''} onApprove={devSheet.onApprove} onCancel={devSheet.onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { width: '100%', height: 400, backgroundColor: colors.violetSoft },
  body: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background, padding: space.lg, paddingTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  priceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  myPkg: { flexDirection: 'row', gap: space.md, backgroundColor: colors.successSoft, borderRadius: radii.lg, padding: space.lg, alignItems: 'center' },
  pkg: { flexDirection: 'row', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center' },
  policy: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md },
});
