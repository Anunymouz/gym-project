import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { formatGhs, MAX_BOOKING_NOTE, pesewas, type DaySlots, type Slot, type TrainerDetail } from '@bgym/shared';
import { Header } from '@/components/header';
import { CheckCircleIcon, PackageIcon, WalletIcon } from '@/components/icons';
import { DevPaymentSheet } from '@/components/payment/dev-payment-sheet';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ApiError, trainersApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { usePayment } from '@/lib/use-payment';
import { colors, fonts, radii, space } from '@/theme';

const DAYS = 14;
const TZ = 'Africa/Accra';
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

/** Pick a day and time, then book with a package session or pay. */
export default function Book() {
  const { trainerId } = useLocalSearchParams<{ trainerId: string }>();
  const { user } = useSession();
  const [t, setT] = useState<TrainerDetail | null>(null);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [usePackage, setUsePackage] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { pay, devSheet } = usePayment();

  const loadSlots = useCallback(() => trainersApi.slots(trainerId, isoDay(new Date()), DAYS).then(setDays, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load times.')), [trainerId]);
  useEffect(() => {
    trainersApi.detail(trainerId).then(setT, () => undefined);
    void loadSlots();
  }, [trainerId, loadSlots]);

  const pkg = useMemo(() => (slot ? t?.myPackages.find((p) => Date.parse(p.endsAt) >= Date.parse(slot.endsAt)) : t?.myPackages[0]) ?? null, [t, slot]);
  const withPackage = !!pkg && usePackage;
  const current = days?.[day];

  const book = async () => {
    if (!slot || !t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await trainersApi.book(trainerId, { startsAt: slot.startsAt, ...(withPackage && { packagePurchaseId: pkg!.id }), ...(note.trim() && { note: note.trim() }) });
      if (res.reference) {
        const outcome = await pay({ reference: res.reference, amountPesewas: res.amountPesewas, provider: res.provider!, authorizationUrl: res.authorizationUrl });
        if (outcome === 'cancelled') {
          // Release the hold straight away so the time is free for others.
          if (res.bookingId) await trainersApi.cancel(res.bookingId).catch(() => undefined);
          setBusy(false);
          return;
        }
        if (outcome === 'unconfirmed') {
          setError('We haven’t had confirmation of your payment yet. If you were charged, the session will appear in My bookings shortly.');
          setBusy(false);
          return;
        }
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(slot.startsAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t book that time.');
      if (e instanceof ApiError && e.status === 409) {
        setSlot(null);
        void loadSlots();
      }
    } finally {
      setBusy(false);
    }
  };

  if (done && t) {
    return (
      <Screen edges={['top', 'bottom']} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg, padding: space.xl }}>
        <Animated.View entering={ZoomIn.springify().damping(12)}><CheckCircleIcon size={84} color={colors.success} weight="fill" /></Animated.View>
        <Animated.View entering={FadeIn.delay(150)} style={{ alignItems: 'center', gap: space.sm }}>
          <Text variant="title" style={{ textAlign: 'center' }}>You’re booked!</Text>
          <Text style={{ textAlign: 'center' }}>{longDate(done)} at {time(done)} with {t.name} at {t.gym.name}.</Text>
          <Text muted style={{ textAlign: 'center' }}>We’ll remind you the day before and an hour before.</Text>
        </Animated.View>
        <View style={{ alignSelf: 'stretch', gap: space.sm }}>
          <Button title="See my bookings" onPress={() => router.replace('/bookings')} />
          <Button title="Done" variant="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} style={{ flex: 1, gap: space.md }}>
      <Header back title="Book a session" />
      {t && (
        <View style={styles.trainer}>
          <Image source={t.photoUrl ? { uri: t.photoUrl } : undefined} style={styles.avatar} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">{t.name}</Text>
            <Text variant="small" muted>{t.sessionDurationMin} min · {t.gym.name}</Text>
          </View>
        </View>
      )}

      <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {(days ?? Array.from({ length: 7 }, () => null)).map((d, i) => {
          const date = d ? new Date(`${d.date}T12:00:00Z`) : null;
          const on = i === day;
          const empty = d ? d.slots.length === 0 : false;
          return (
            <Pressable key={d?.date ?? i} disabled={!d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={date ? `${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}, ${d!.slots.length} times` : 'Loading'} onPress={() => { setDay(i); setSlot(null); }} style={[styles.day, on && styles.dayOn, empty && !on && { opacity: 0.45 }]}>
              <Text variant="smallBold" style={on ? { color: colors.onDarkMuted } : { color: colors.textMuted }}>{date ? (i === 0 ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })) : ' '}</Text>
              <Text style={[styles.dayNum, on && { color: colors.white }]}>{date ? date.getUTCDate() : '·'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">
        {!days ? (
          <ActivityIndicator color={colors.flare} style={{ marginTop: space.xl }} />
        ) : current && current.slots.length === 0 ? (
          <Text muted style={{ textAlign: 'center', marginTop: space.lg }}>No free times this day. Try another day.</Text>
        ) : (
          <View style={styles.slots}>
            {current?.slots.map((s) => {
              const on = slot?.startsAt === s.startsAt;
              return (
                <Pressable key={s.startsAt} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setSlot(s); void Haptics.selectionAsync(); }} style={[styles.slot, on && styles.slotOn]}>
                  <Text variant="bodyBold" style={on ? { color: colors.white } : undefined}>{time(s.startsAt)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {slot && t && (
          <Animated.View entering={FadeIn} style={{ gap: space.md }}>
            {pkg && (
              <View style={{ gap: space.sm }}>
                <Text variant="label" muted>Pay with</Text>
                <Choice on={usePackage} onPress={() => setUsePackage(true)} icon={<PackageIcon size={22} color={colors.success} weight="duotone" />} title="A session from my package" detail={`${pkg.sessionsRemaining} left · ${pkg.name}`} />
                <Choice on={!usePackage} onPress={() => setUsePackage(false)} icon={<WalletIcon size={22} color={colors.flare} weight="duotone" />} title={`Pay ${formatGhs(pesewas(t.sessionPricePesewas))}`} detail="Mobile money or card" />
              </View>
            )}
            <TextInput value={note} onChangeText={setNote} maxLength={MAX_BOOKING_NOTE} multiline placeholder={`Anything ${t.name.split(' ')[0]} should know? Goals, injuries… (optional)`} placeholderTextColor={colors.textMuted} style={styles.note} accessibilityLabel="Note for the trainer" />
            <Text variant="small" muted>Free cancellation until {t.cancelHours} hours before the session.</Text>
          </Animated.View>
        )}
        {error && <Text variant="smallBold" style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text>}
      </ScrollView>

      {t && (
        <Button
          title={!slot ? 'Choose a time' : withPackage ? `Book ${time(slot.startsAt)} with my package` : `Pay ${formatGhs(pesewas(t.sessionPricePesewas))} and book`}
          disabled={!slot}
          loading={busy}
          onPress={() => void book()}
        />
      )}
      <DevPaymentSheet checkout={devSheet.checkout} email={user?.email ?? ''} onApprove={devSheet.onApprove} onCancel={devSheet.onCancel} />
    </Screen>
  );
}

function Choice({ on, onPress, icon, title, detail }: { on: boolean; onPress: () => void; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={[styles.choice, on && styles.choiceOn]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text variant="bodyBold">{title}</Text>
        <Text variant="small" muted>{detail}</Text>
      </View>
      <View style={[styles.radio, on && styles.radioOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trainer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.violetSoft },
  day: { width: 58, height: 72, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  dayNum: { fontFamily: fonts.extrabold, fontSize: 22, lineHeight: 26, color: colors.text },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: { width: '23%', flexGrow: 1, maxWidth: '24%', height: 46, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: colors.flare, borderColor: colors.flare },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, padding: space.md },
  choiceOn: { borderColor: colors.midnight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioOn: { borderColor: colors.flare, borderWidth: 6 },
  note: { minHeight: 70, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: space.md, fontFamily: fonts.regular, fontSize: 15, color: colors.text, textAlignVertical: 'top' },
});
