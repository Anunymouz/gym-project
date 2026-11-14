import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { MembershipSummary } from '@bgym/shared';
import { Header } from '@/components/header';
import { CaretRightIcon, MapPinIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { membershipsApi } from '@/lib/api';
import { colors, fonts, radii, space } from '@/theme';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Memberships() {
  const [items, setItems] = useState<(MembershipSummary & { upcoming: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    membershipsApi
      .list()
      .then((list) => {
        const now = Date.now();
        setItems(list.map((m) => ({ ...m, upcoming: m.status === 'active' && Date.parse(m.startsAt) > now })));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
  }, []);

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="My memberships" />
      {!items && !error && [0, 1].map((i) => <Skeleton key={i} height={92} radius={18} />)}
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
      {items?.length === 0 && (
        <EmptyState
          icon={<MapPinIcon size={28} color={colors.flare} weight="duotone" />}
          title="No memberships yet"
          body="Join a gym near you and your check-in code will live here."
          action={<View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button title="Find a gym" onPress={() => router.navigate('/gyms')} /></View>}
        />
      )}
      {items?.map((m, i) => {
        const { upcoming } = m;
        const tone = m.status === 'expired' ? { bg: '#FDECEC', fg: colors.danger, label: 'Expired' } : upcoming ? { bg: colors.violetSoft, fg: colors.violet, label: `Starts ${fmt(m.startsAt)}` } : { bg: colors.successSoft, fg: colors.success, label: 'Active' };
        return (
          <Animated.View key={m.id} entering={FadeInDown.delay(i * 60).duration(350)}>
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/membership/[id]', params: { id: m.id } })} style={styles.row}>
              <Image source={m.gym.coverUrl ? { uri: m.gym.coverUrl } : undefined} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyBold">{m.gym.name}</Text>
                <Text variant="small" muted>{m.plan.name} · {m.status === 'expired' ? 'ended' : 'until'} {fmt(m.endsAt)}</Text>
                <View style={[styles.pill, { backgroundColor: tone.bg }]}><Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text></View>
              </View>
              <CaretRightIcon size={18} color="#9AA0B4" />
            </Pressable>
          </Animated.View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.midnight },
  pill: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 2, marginTop: 4 },
  pillText: { fontFamily: fonts.bold, fontSize: 11 },
});
