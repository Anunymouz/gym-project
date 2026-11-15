import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TrainerCard as Card } from '@bgym/shared';
import { Header, IconButton } from '@/components/header';
import { CalendarCheckIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { PhotoHero } from '@/components/photo-hero';
import { useTabBarSpace } from '@/components/tab-bar';
import { TrainerCard } from '@/components/trainers/trainer-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { trainersApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

/** Personal trainers: at the member's gyms first, then others. */
export default function Trainers() {
  const tabSpace = useTabBarSpace();
  const [trainers, setTrainers] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => trainersApi.list().then((t) => { setTrainers(t); setError(null); }, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load trainers.')), []);
  useEffect(() => {
    void load();
  }, [load]);
  const mine = trainers?.filter((t) => t.atMyGym) ?? [];
  const others = trainers?.filter((t) => !t.atMyGym) ?? [];
  const rows: { key: string; title?: string; trainer?: Card }[] = [
    ...(mine.length ? [{ key: 'h-mine', title: 'At your gym' }, ...mine.map((t) => ({ key: t.id, trainer: t }))] : []),
    ...(others.length ? [{ key: 'h-other', title: mine.length ? 'More trainers' : 'Trainers near you' }, ...others.map((t) => ({ key: t.id, trainer: t }))] : []),
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: tabSpace + space.md, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Header title="Trainers" right={<IconButton label="My bookings" onPress={() => router.push('/bookings')}><CalendarCheckIcon size={21} color={colors.text} /></IconButton>} />
            {!trainers && !error && [0, 1, 2].map((i) => <Skeleton key={i} height={136} radius={radii.lg} />)}
            {error && <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Couldn’t load trainers" body={error} action={<Button title="Try again" variant="dark" onPress={() => void load()} />} />}
            {trainers?.length === 0 && (
              <PhotoHero source={require('@/assets/images/photos/trainers.jpg')} eyebrow="Personal training" title="Trainers are on their way" body="Gyms are adding their coaches. Check back soon to book single sessions or coaching packages." height={360} />
            )}
          </View>
        }
        renderItem={({ item }) => (item.title ? <Text variant="label" muted style={{ marginTop: space.sm }}>{item.title}</Text> : <TrainerCard trainer={item.trainer!} />)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.flare} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
