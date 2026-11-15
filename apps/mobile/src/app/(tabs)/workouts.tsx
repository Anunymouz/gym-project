import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WORKOUT_GOALS, type WorkoutGoal, type WorkoutsHome } from '@bgym/shared';
import { Header, IconButton } from '@/components/header';
import { ClockCounterClockwiseIcon, FlameIcon, LockSimpleIcon, TimerIcon, TrophyIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { PhotoHero } from '@/components/photo-hero';
import { useTabBarSpace } from '@/components/tab-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { WorkoutCard } from '@/components/workouts/workout-card';
import { workoutsApi } from '@/lib/api';
import { colors, fonts, radii, space } from '@/theme';

/** Guided workouts: a few free for everyone, the full library with any gym membership. */
export default function Workouts() {
  const tabSpace = useTabBarSpace();
  const [home, setHome] = useState<WorkoutsHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState<WorkoutGoal | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => workoutsApi.home().then((h) => { setHome(h); setError(null); }, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load workouts.')), []);
  // Reload on focus so a just-finished workout shows in the stats.
  useFocusEffect(useCallback(() => void load(), [load]));

  const goals = [...new Set(home?.workouts.map((w) => w.goal))];
  const shown = home?.workouts.filter((w) => !goal || w.goal === goal) ?? [];
  const lockedCount = home?.workouts.filter((w) => w.locked).length ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={shown}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: tabSpace + space.md, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Header title="Workouts" right={<IconButton label="Workout history" onPress={() => router.push('/workout-history')}><ClockCounterClockwiseIcon size={21} color={colors.text} /></IconButton>} />
            {!home && !error && (
              <>
                <Skeleton height={92} radius={radii.lg} />
                {[0, 1].map((i) => <Skeleton key={i} height={210} radius={radii.xl} />)}
              </>
            )}
            {error && !home && <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Couldn’t load workouts" body={error} action={<Button title="Try again" variant="dark" onPress={() => void load()} />} />}
            {home && (
              <Animated.View entering={FadeInDown.duration(400)} style={styles.stats}>
                <Stat icon={<FlameIcon size={18} color={colors.flare} weight="fill" />} value={home.stats.streakDays} label="day streak" />
                <View style={styles.divider} />
                <Stat icon={<TrophyIcon size={18} color={colors.violet} weight="fill" />} value={home.stats.thisWeek} label="this week" />
                <View style={styles.divider} />
                <Stat icon={<TimerIcon size={18} color={colors.success} weight="fill" />} value={home.stats.totalMinutes} label="minutes total" />
              </Animated.View>
            )}
            {home && !home.unlocked && lockedCount > 0 && (
              <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.unlock}>
                <View style={styles.unlockIcon}><LockSimpleIcon size={20} color={colors.white} weight="bold" /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyBold" style={{ color: colors.white }}>Unlock {lockedCount} more workouts</Text>
                  <Text variant="small" style={{ color: colors.onDarkMuted }}>Join any gym on BGYM and the whole library is yours, with demos for every move.</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.navigate('/gyms')} style={({ pressed }) => [styles.unlockButton, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.unlockButtonText}>Find a gym</Text>
                </Pressable>
              </Animated.View>
            )}
            {goals.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
                <View style={{ width: space.lg - space.sm }} />
                {[null, ...goals].map((g) => (
                  <Pressable key={g ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: goal === g }} onPress={() => setGoal(g)} style={[styles.chip, goal === g && styles.chipOn]}>
                    <Text style={[styles.chipText, goal === g && { color: colors.white }]}>{g ? WORKOUT_GOALS[g] : 'All'}</Text>
                  </Pressable>
                ))}
                <View style={{ width: space.lg - space.sm }} />
              </ScrollView>
            )}
            {home?.workouts.length === 0 && <PhotoHero source={require('@/assets/images/photos/workouts.jpg')} eyebrow="Train anywhere" title="Workouts are on their way" body="The BGYM team is putting the library together. Check back soon." height={340} />}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 5) * 60).duration(380)}>
            <WorkoutCard workout={item} />
          </Animated.View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} tintColor={colors.flare} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text variant="small" muted>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, paddingVertical: space.lg, paddingHorizontal: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 28, color: colors.text },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  unlock: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.midnight, borderRadius: radii.lg, padding: space.lg },
  unlockIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flare, alignItems: 'center', justifyContent: 'center' },
  unlockButton: { backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  unlockButtonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.midnight },
  chip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
