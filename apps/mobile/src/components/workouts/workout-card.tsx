import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { WORKOUT_GOALS, WORKOUT_LEVELS, type WorkoutCard as Card } from '@bgym/shared';
import { CheckCircleIcon, ClockIcon, LockSimpleIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors, fonts, radii, space } from '@/theme';

/** A workout in the library: cover photo, name, level, length and whether it's locked. */
export function WorkoutCard({ workout: w }: { workout: Card }) {
  const label = `${w.title}, ${WORKOUT_LEVELS[w.level]}, about ${w.durationMin} minutes, ${w.exerciseCount} exercises${w.locked ? ', locked' : w.isFree ? ', free' : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <Image source={w.coverUrl ? { uri: w.coverUrl } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityIgnoresInvertColors />
      <LinearGradient colors={['rgba(8,10,26,0.1)', 'rgba(8,10,26,0.35)', 'rgba(8,10,26,0.9)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.badges}>
        {w.locked ? (
          <View style={[styles.badge, { backgroundColor: 'rgba(8,10,26,0.72)' }]}><LockSimpleIcon size={12} color={colors.white} weight="bold" /><Text style={[styles.badgeText, { color: colors.white }]}>Members</Text></View>
        ) : w.isFree ? (
          <View style={[styles.badge, { backgroundColor: colors.flare }]}><Text style={[styles.badgeText, { color: colors.white }]}>Free</Text></View>
        ) : null}
        {w.doneCount > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.white }]}><CheckCircleIcon size={12} color={colors.success} weight="fill" /><Text style={styles.badgeText}>Done {w.doneCount}×</Text></View>
        )}
      </View>
      <View style={styles.content}>
        <Text variant="label" style={{ color: colors.ember }}>{WORKOUT_GOALS[w.goal]}</Text>
        <Text variant="heading" style={{ color: colors.white, fontFamily: fonts.extrabold, fontSize: 21, lineHeight: 26 }} numberOfLines={2}>{w.title}</Text>
        <View style={styles.meta}>
          <Text variant="smallBold" style={styles.metaText}>{WORKOUT_LEVELS[w.level]}</Text>
          <Text style={styles.dot}>·</Text>
          <ClockIcon size={13} color={colors.onDarkMuted} />
          <Text variant="smallBold" style={styles.metaText}>{w.durationMin} min</Text>
          <Text style={styles.dot}>·</Text>
          <Text variant="smallBold" style={styles.metaText}>{w.exerciseCount} exercises</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: 210, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.midnight, justifyContent: 'flex-end' },
  badges: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  content: { padding: space.lg, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaText: { color: colors.onDarkMuted },
  dot: { color: colors.onDarkMuted },
});
