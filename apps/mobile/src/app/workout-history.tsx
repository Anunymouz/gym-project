import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { WorkoutHistoryItem } from '@bgym/shared';
import { Header } from '@/components/header';
import { CheckCircleIcon, ClockIcon, LightningIcon, TimerIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { workoutsApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

const TZ = 'Africa/Accra';
const EFFORT = ['Easy', 'Steady', 'Hard', 'Very hard', 'All out'];
const month = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: TZ });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const minutes = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`);

/** Workouts → History: every finished workout, newest first, by month. */
export default function WorkoutHistory() {
  const [items, setItems] = useState<WorkoutHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => workoutsApi.history().then((h) => { setItems(h); setError(null); }, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load your history.')), []);
  useEffect(() => {
    void load();
  }, [load]);

  const sections: { title: string; data: WorkoutHistoryItem[] }[] = [];
  for (const it of items ?? []) {
    const m = month(it.completedAt);
    if (sections.at(-1)?.title !== m) sections.push({ title: m, data: [] });
    sections.at(-1)!.data.push(it);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <SectionList
        sections={sections}
        keyExtractor={(it) => it.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxl, gap: space.sm }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Header title="Workout history" back />
            {!items && !error && [0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={radii.lg} />)}
            {error && !items && <EmptyState icon={<TimerIcon size={28} color={colors.flare} weight="duotone" />} title="Couldn’t load your history" body={error} action={<Button title="Try again" variant="dark" onPress={() => void load()} />} />}
            {items?.length === 0 && <EmptyState icon={<TimerIcon size={28} color={colors.flare} weight="duotone" />} title="No workouts yet" body="Finish a workout and it shows up here, with your time and how it felt." action={<Button title="Pick a workout" onPress={() => router.navigate('/workouts')} />} />}
          </View>
        }
        renderSectionHeader={({ section }) => <Text variant="label" muted style={{ marginTop: space.md }}>{section.title}</Text>}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(320)}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.workout.title}, ${day(item.completedAt)}, ${minutes(item.durationSec)}`} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: item.workout.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
              <Image source={item.workout.coverUrl ? { uri: item.workout.coverUrl } : undefined} style={styles.cover} contentFit="cover" transition={200} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="bodyBold" numberOfLines={1}>{item.workout.title}</Text>
                <Text variant="small" muted>{day(item.completedAt)} · {time(item.completedAt)}</Text>
                <View style={styles.meta}>
                  <View style={styles.metaItem}><ClockIcon size={13} color={colors.textMuted} /><Text variant="smallBold" muted>{minutes(item.durationSec)}</Text></View>
                  <View style={styles.metaItem}><CheckCircleIcon size={13} color={item.exercisesCompleted === item.exercisesTotal ? colors.success : colors.textMuted} weight="fill" /><Text variant="smallBold" muted>{item.exercisesCompleted}/{item.exercisesTotal}</Text></View>
                  {item.effort && <View style={styles.metaItem}><LightningIcon size={13} color={colors.flare} weight="fill" /><Text variant="smallBold" muted>{EFFORT[item.effort - 1]}</Text></View>}
                </View>
              </View>
            </Pressable>
          </Animated.View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.flare} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radii.lg, padding: space.sm },
  cover: { width: 68, height: 68, borderRadius: radii.md, backgroundColor: colors.violetSoft },
  meta: { flexDirection: 'row', gap: space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
