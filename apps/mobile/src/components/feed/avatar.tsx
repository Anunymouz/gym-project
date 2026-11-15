import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ContentAuthor } from '@bgym/shared';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'B';

/** A gym's cover or a member's photo (or initials), optionally with a story ring. */
export function Avatar({
  author,
  gym,
  size = 40,
  ring,
}: {
  author: ContentAuthor;
  gym: { name: string; coverUrl: string | null };
  size?: number;
  /** "new" = unseen story (brand gradient), "seen" = grey ring. */
  ring?: 'new' | 'seen';
}) {
  const uri = author.kind === 'gym' ? gym.coverUrl : author.avatarUrl;
  const name = author.kind === 'gym' ? gym.name : author.name;
  const inner = (
    <View style={[styles.inner, { width: size, height: size, borderRadius: size / 2 }, author.kind === 'member' && !uri && { backgroundColor: colors.violet }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ color: colors.white, fontSize: size * 0.36, lineHeight: size * 0.44, fontWeight: '700' }}>{initials(name)}</Text>
      )}
    </View>
  );
  if (!ring) return inner;
  const pad = Math.max(2, Math.round(size * 0.05));
  const outer = size + pad * 4;
  return ring === 'new' ? (
    <LinearGradient colors={[colors.flare, colors.ember, colors.violet]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: outer, height: outer, borderRadius: outer / 2, padding: pad }}>
      <View style={[styles.gap, { borderRadius: outer / 2, padding: pad }]}>{inner}</View>
    </LinearGradient>
  ) : (
    <View style={{ width: outer, height: outer, borderRadius: outer / 2, padding: pad, backgroundColor: colors.border }}>
      <View style={[styles.gap, { borderRadius: outer / 2, padding: pad }]}>{inner}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { overflow: 'hidden', backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
  gap: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
