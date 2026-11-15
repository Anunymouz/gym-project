import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { formatGhs, pesewas, type TrainerCard as Card } from '@bgym/shared';
import { MapPinIcon, StarIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

/** A trainer in a list: photo, name, gym, specialties and the lowest price per session. */
export function TrainerCard({ trainer: t, compact }: { trainer: Card; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.name}, trainer at ${t.gym.name}, from ${formatGhs(pesewas(t.fromPesewas))} a session`}
      onPress={() => router.push({ pathname: '/trainer/[id]', params: { id: t.id } })}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <Image source={t.photoUrl ? { uri: t.photoUrl } : undefined} style={[styles.photo, compact && { width: 76, height: 76 }]} contentFit="cover" transition={200} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="bodyBold" numberOfLines={1} style={{ flexShrink: 1 }}>{t.name}</Text>
          {t.atMyGym && <View style={styles.mine}><StarIcon size={11} color={colors.flare} weight="fill" /><Text style={styles.mineText}>Your gym</Text></View>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MapPinIcon size={13} color={colors.textMuted} />
          <Text variant="small" muted numberOfLines={1}>{t.gym.name}</Text>
        </View>
        {!compact && (
          <View style={styles.tags}>
            {t.specialties.slice(0, 3).map((s) => (
              <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
            ))}
          </View>
        )}
        <Text variant="smallBold">
          <Text variant="smallBold" muted>From </Text>
          {formatGhs(pesewas(t.fromPesewas))}
          <Text variant="small" muted> / {t.sessionDurationMin} min</Text>
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  photo: { width: 96, height: 112, borderRadius: radii.md, backgroundColor: colors.violetSoft },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.flareSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  mineText: { fontSize: 11, fontWeight: '700', color: colors.flare },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { backgroundColor: colors.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.text },
});
