import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { StoryTray as Tray } from '@bgym/shared';
import { PlusIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { colors, space } from '@/theme';
import { Avatar } from './avatar';

const SIZE = 62;

/** The row of story rings at the top of Home, with "Your story" (+) first. */
export function StoryTray({ tray, onCreate }: { tray: Tray; onCreate: () => void }) {
  const { user } = useSession();
  const mine = tray.groups.find((g) => g.mine);
  const others = tray.groups.filter((g) => !g.mine);
  const canPost = tray.postableGyms.length > 0;
  if (!canPost && others.length === 0) return null;
  const me = { kind: 'member' as const, id: user?.id ?? 'me', name: user?.name ?? 'You', avatarUrl: user?.avatarUrl ?? null };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {(canPost || mine) && (
        <View style={styles.item}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mine ? 'Your story' : 'Add to your story'}
            onPress={() => (mine ? router.push({ pathname: '/stories/[key]', params: { key: mine.key } }) : onCreate())}
          >
            <Avatar author={me} gym={{ name: me.name, coverUrl: null }} size={SIZE} ring={mine ? 'seen' : undefined} />
            {canPost && (
              <Pressable accessibilityRole="button" accessibilityLabel="Add to your story" onPress={onCreate} hitSlop={8} style={[styles.plus, mine && { right: 0, bottom: 0 }]}>
                <PlusIcon size={14} color={colors.white} weight="bold" />
              </Pressable>
            )}
          </Pressable>
          <Text variant="small" numberOfLines={1} style={styles.name}>Your story</Text>
        </View>
      )}
      {others.map((g) => (
        <Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.author.kind === 'gym' ? g.gym.name : g.author.name}'s story${g.allSeen ? '' : ', new'}`} onPress={() => router.push({ pathname: '/stories/[key]', params: { key: g.key } })} style={styles.item}>
          <Avatar author={g.author} gym={g.gym} size={SIZE} ring={g.allSeen ? 'seen' : 'new'} />
          <Text variant="small" numberOfLines={1} style={[styles.name, !g.allSeen && { fontWeight: '700' }]}>{g.author.kind === 'gym' ? g.gym.name : g.author.name.split(' ')[0]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -space.lg },
  row: { paddingHorizontal: space.lg, gap: space.md },
  item: { width: SIZE + 12, alignItems: 'center', gap: 4 },
  name: { maxWidth: SIZE + 12, textAlign: 'center' },
  plus: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.flare, borderWidth: 2.5, borderColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
