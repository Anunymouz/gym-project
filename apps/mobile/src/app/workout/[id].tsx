import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WORKOUT_GOALS, WORKOUT_LEVELS, type WorkoutDetail } from '@bgym/shared';
import { GlassButton } from '@/components/glass-button';
import { ArrowLeftIcon, BarbellIcon, ClockIcon, LightningIcon, LockSimpleIcon, PlayIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { stepSummary } from '@/components/workouts/step-summary';
import { workoutsApi } from '@/lib/api';
import { colors, fonts, radii, space } from '@/theme';

/** A workout: what it's for, the moves in order, and Start (or how to unlock it). */
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => workoutsApi.detail(id).then(setW, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load this workout.')), [id]);
  // Reload on focus so "done" counts are fresh after finishing it.
  useFocusEffect(useCallback(() => void load(), [load]));

  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60, padding: space.lg }]}>
        <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Workout not available" body={error} action={<Button title="Back" variant="dark" onPress={() => router.back()} />} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {w ? (
          <View style={styles.hero}>
            <Image source={w.coverUrl ? { uri: w.coverUrl } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityIgnoresInvertColors />
            <LinearGradient colors={['rgba(8,10,26,0.25)', 'rgba(8,10,26,0.2)', 'rgba(8,10,26,0.92)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
            <View style={styles.heroText}>
              <Text variant="label" style={{ color: colors.ember }}>{WORKOUT_GOALS[w.goal]}</Text>
              <Text variant="display" style={{ color: colors.white }}>{w.title}</Text>
            </View>
          </View>
        ) : (
          <Skeleton height={340} radius={0} />
        )}

        <View style={styles.body}>
          {w ? (
            <>
              <Animated.View entering={FadeInDown.duration(380)} style={styles.facts}>
                <Fact icon={<LightningIcon size={16} color={colors.flare} weight="fill" />} text={WORKOUT_LEVELS[w.level]} />
                <Fact icon={<ClockIcon size={16} color={colors.flare} weight="bold" />} text={`About ${w.durationMin} min`} />
                <Fact icon={<BarbellIcon size={16} color={colors.flare} weight="bold" />} text={w.equipment.length ? w.equipment.join(', ') : 'No equipment'} />
              </Animated.View>
              {w.description && <Text style={{ color: colors.text }}>{w.description}</Text>}
              {w.locked && (
                <View style={styles.locked}>
                  <LockSimpleIcon size={20} color={colors.flare} weight="bold" />
                  <Text variant="small" style={{ flex: 1 }}>Join any gym on BGYM to unlock this workout, with step-by-step guidance and demos for every move.</Text>
                </View>
              )}
              <Text variant="label" muted style={{ marginTop: space.sm }}>{w.steps.length} exercises</Text>
              <View style={styles.steps}>
                {w.steps.map((s, i) => {
                  const thumb = s.exercise.media?.thumbUrl ?? (s.exercise.media?.type !== 'video' ? s.exercise.media?.url : null);
                  return (
                    <Animated.View key={`${s.exercise.id}-${i}`} entering={FadeInDown.delay(60 + Math.min(i, 8) * 40).duration(340)} style={styles.step}>
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={200} />
                      ) : (
                        <View style={[styles.thumb, styles.number]}><Text style={styles.numberText}>{i + 1}</Text></View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyBold" numberOfLines={1}>{s.exercise.name}</Text>
                        <Text variant="small" muted numberOfLines={1}>{stepSummary(s)}</Text>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} height={i === 0 ? 40 : 64} radius={radii.md} />)
          )}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <GlassButton label="Back" onPress={() => router.back()}><ArrowLeftIcon size={20} color={colors.text} /></GlassButton>
      </View>

      {w && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          {w.locked ? (
            <Button title="Find a gym to unlock" icon={<LockSimpleIcon size={18} color={colors.white} weight="bold" />} onPress={() => router.navigate('/gyms')} />
          ) : (
            <Button title={w.doneCount ? 'Start again' : 'Start workout'} icon={<PlayIcon size={18} color={colors.white} weight="fill" />} onPress={() => router.push({ pathname: '/workout/play/[id]', params: { id: w.id } })} />
          )}
          {w.doneCount > 0 && <Text variant="small" muted style={{ textAlign: 'center' }}>You’ve done this {w.doneCount === 1 ? 'once' : `${w.doneCount} times`}.</Text>}
        </View>
      )}
    </View>
  );
}

function Fact({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={styles.fact}>
      {icon}
      <Text variant="smallBold" numberOfLines={1} style={{ flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { height: 340, backgroundColor: colors.midnight, justifyContent: 'flex-end' },
  heroText: { padding: space.lg, gap: 4 },
  body: { padding: space.lg, gap: space.md },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  locked: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.flareSoft, borderRadius: radii.md, padding: space.md },
  steps: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: space.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm },
  thumb: { width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.background },
  number: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetSoft },
  numberText: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.violet },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 6, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md },
});
