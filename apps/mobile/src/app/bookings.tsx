import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { MyBooking, MyPackage } from '@bgym/shared';
import { Header } from '@/components/header';
import { CalendarCheckIcon, MapPinIcon, PackageIcon, PhoneIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { trainersApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

const TZ = 'Africa/Accra';
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });

/** Cancelling now is free (before the trainer's notice period starts). */
const stillFree = (until: string) => Date.now() <= Date.parse(until);

const STATUS: Record<MyBooking['status'], { label: string; color: string }> = {
  pending: { label: 'Awaiting payment', color: colors.flare },
  confirmed: { label: 'Confirmed', color: colors.success },
  completed: { label: 'Completed', color: colors.textMuted },
  no_show: { label: 'Missed', color: colors.danger },
  cancelled: { label: 'Cancelled', color: colors.danger },
};

/** Me → My bookings: upcoming sessions (cancel), packages, and history. */
export default function Bookings() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [packages, setPackages] = useState<MyPackage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [now] = useState(() => Date.now());
  const load = useCallback(
    () =>
      Promise.all([trainersApi.myBookings(), trainersApi.myPackages()]).then(
        ([b, p]) => {
          setBookings(b);
          setPackages(p);
        },
        () => setBookings([]),
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = (bookings ?? []).filter((b) => (b.status === 'confirmed' || b.status === 'pending') && Date.parse(b.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = (bookings ?? []).filter((b) => !upcoming.includes(b));

  const cancel = (b: MyBooking) => {
    const free = stillFree(b.freeCancelUntil);
    const outcome = free ? (b.paidWith === 'package' ? 'The session goes back on your package.' : 'You’ll get a full refund to the account you paid with.') : `It’s less than the trainer’s notice period, so ${b.paidWith === 'package' ? 'the session still counts' : 'it won’t be refunded'}.`;
    Alert.alert('Cancel this session?', `${when(b.startsAt)} with ${b.trainer.name}. ${outcome}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: () => void trainersApi.cancel(b.id).then((updated) => setBookings((l) => l?.map((x) => (x.id === b.id ? updated : x)) ?? null), (e: unknown) => Alert.alert('Couldn’t cancel', e instanceof Error ? e.message : 'Try again.')),
      },
    ]);
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="My bookings" />
      <ScrollView contentContainerStyle={{ gap: space.md }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.flare} />}>
        {!bookings && [0, 1].map((i) => <Skeleton key={i} height={120} radius={radii.lg} />)}

        {packages.map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/book/[trainerId]', params: { trainerId: p.trainer.id } })} style={styles.pkg}>
            <PackageIcon size={26} color={colors.success} weight="duotone" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">{p.name} · {p.trainer.name}</Text>
              <Text variant="small" muted>{p.sessionsRemaining} of {p.sessionsCount} sessions left · use by {shortDate(p.endsAt)}</Text>
            </View>
            <Text variant="smallBold" style={{ color: colors.flare }}>Book</Text>
          </Pressable>
        ))}

        {bookings && bookings.length === 0 && packages.length === 0 && (
          <EmptyState icon={<CalendarCheckIcon size={28} color={colors.flare} weight="duotone" />} title="No sessions yet" body="Book a personal trainer for a single session or a coaching package." action={<Button title="Find a trainer" onPress={() => router.navigate('/trainers')} />} />
        )}

        {upcoming.length > 0 && <Text variant="label" muted>Upcoming</Text>}
        {upcoming.map((b) => (
          <BookingCard key={b.id} booking={b} onCancel={() => cancel(b)} />
        ))}
        {past.length > 0 && <Text variant="label" muted style={{ marginTop: space.sm }}>Past</Text>}
        {past.map((b) => <BookingCard key={b.id} booking={b} />)}
      </ScrollView>
    </Screen>
  );
}

function BookingCard({ booking: b, onCancel }: { booking: MyBooking; onCancel?: () => void }) {
  const status = STATUS[b.status];
  return (
    <View style={[styles.card, !onCancel && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <Image source={b.trainer.photoUrl ? { uri: b.trainer.photoUrl } : undefined} style={styles.avatar} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{when(b.startsAt)}</Text>
          <Text variant="small" muted>{b.trainer.name} · {b.paidWith === 'package' ? 'Package session' : 'Paid'}</Text>
        </View>
        <Text variant="smallBold" style={{ color: status.color }}>{b.status === 'cancelled' && b.cancelledBy === 'trainer' ? 'Cancelled by trainer' : status.label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <MapPinIcon size={14} color={colors.textMuted} />
        <Text variant="small" muted numberOfLines={1} style={{ flex: 1 }}>{b.gym.name} · {b.gym.addressText}</Text>
      </View>
      {b.refundDue && <Text variant="smallBold" style={{ color: colors.success }}>Refunded to the account you paid with.</Text>}
      {onCancel && (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {b.trainer.phone && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Call ${b.trainer.name}`} onPress={() => void Linking.openURL(`tel:${b.trainer.phone}`)} style={styles.action}>
              <PhoneIcon size={16} color={colors.text} />
              <Text variant="smallBold">Call</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.action}>
            <Text variant="smallBold" style={{ color: colors.danger }}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pkg: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.successSoft, borderRadius: radii.lg, padding: space.lg },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.violetSoft },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8 },
});
