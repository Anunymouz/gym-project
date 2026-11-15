import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { BlockedUser } from '@bgym/shared';
import { Avatar } from '@/components/feed/avatar';
import { Header } from '@/components/header';
import { ProhibitIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { communityApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

/** People you've blocked. Unblocking shows their posts, comments and stories again. */
export default function Blocked() {
  const [people, setPeople] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    communityApi.blocks().then(setPeople, (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load.'));
  }, []);
  const unblock = (p: BlockedUser) =>
    Alert.alert(`Unblock ${p.name}?`, 'You’ll see each other’s posts, comments and stories again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => void communityApi.unblock(p.id).then(() => setPeople((l) => l?.filter((x) => x.id !== p.id) ?? null)) },
    ]);
  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header title="Blocked people" back />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!people && !error && [0, 1].map((i) => <Skeleton key={i} height={64} radius={radii.md} />)}
      {people?.length === 0 && (
        <EmptyState icon={<ProhibitIcon size={28} color={colors.flare} weight="duotone" />} title="Nobody blocked" body="Block someone from the ⋯ menu on their post or story. They won’t be told." />
      )}
      {people?.map((p) => (
        <View key={p.id} style={styles.row}>
          <Avatar author={{ kind: 'member', id: p.id, name: p.name, avatarUrl: p.avatarUrl }} gym={{ name: p.name, coverUrl: null }} size={42} />
          <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{p.name}</Text>
          <View style={{ width: 110 }}><Button title="Unblock" variant="secondary" onPress={() => unblock(p)} /></View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
});
