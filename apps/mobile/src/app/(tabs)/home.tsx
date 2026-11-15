import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FeedPost } from '@bgym/shared';
import { Mark } from '@/components/brand/mark';
import { Wordmark } from '@/components/brand/wordmark';
import { PostCard } from '@/components/feed/post-card';
import { ReportSheet } from '@/components/feed/report-sheet';
import { IconButton } from '@/components/header';
import { BellIcon, NewspaperIcon, ShoppingBagIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { PhotoHero } from '@/components/photo-hero';
import { useTabBarSpace } from '@/components/tab-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { feedApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; posts: FeedPost[]; cursor: string | null; gyms: number };

export default function Home() {
  const tabSpace = useTabBarSpace();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await feedApi.page();
      setNow(Date.now());
      setState({ status: 'ready', posts: page.posts, cursor: page.nextCursor, gyms: page.gyms });
    } catch (e) {
      setState((s) => (s.status === 'ready' ? s : { status: 'error', message: e instanceof Error ? e.message : 'Couldn’t load your feed.' }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (state.status !== 'ready' || !state.cursor || busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.page(state.cursor);
      setState((s) => {
        if (s.status !== 'ready') return s;
        const seen = new Set(s.posts.map((p) => p.id));
        return { ...s, posts: [...s.posts, ...page.posts.filter((p) => !seen.has(p.id))], cursor: page.nextCursor };
      });
    } catch {
      // Leave the cursor as it is; scrolling again retries.
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  };

  const ready = state.status === 'ready' ? state : null;
  const member = ready ? ready.gyms > 0 : false;

  const header = (
    <View style={{ gap: space.md }}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Mark width={44} />
          <Wordmark height={22} />
        </View>
        <IconButton label="Notifications" onPress={() => router.push('/notifications')}><BellIcon size={21} color={colors.text} /></IconButton>
        <IconButton label="BGYM Store" onPress={() => router.push('/store')}><ShoppingBagIcon size={21} color={colors.text} /></IconButton>
      </View>

      {state.status === 'loading' && [0, 1].map((i) => <Skeleton key={i} height={320} radius={radii.lg} />)}

      {state.status === 'error' && (
        <EmptyState
          icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />}
          title="Couldn’t load your feed"
          body={state.message}
          action={<Button title="Try again" variant="dark" onPress={() => { setState({ status: 'loading' }); void load(); }} />}
        />
      )}

      {ready && !member && (
        <>
          <PhotoHero
            source={require('@/assets/images/photos/feed.jpg')}
            eyebrow="Your feed"
            title="Your gym's workouts, right here"
            body="Join a gym to see its workout tips, news and photos in your feed."
            height={380}
          >
            <View style={{ marginTop: space.sm }}>
              <Button title="Find a gym near you" onPress={() => router.navigate('/gyms')} />
            </View>
          </PhotoHero>
          <StoreBanner />
        </>
      )}

      {ready && member && ready.posts.length === 0 && (
        <EmptyState
          icon={<NewspaperIcon size={28} color={colors.flare} weight="duotone" />}
          title="No posts yet"
          body="When your gym shares tips, news or photos, they’ll show up here."
        />
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <FlatList
        data={member ? ready!.posts : []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} now={now} onReport={setReporting} />}
        ListHeaderComponent={header}
        ListFooterComponent={
          member ? (
            <View style={{ gap: space.md }}>
              {loadingMore && <Skeleton height={240} radius={radii.lg} />}
              {!ready!.cursor && ready!.posts.length > 0 && <Text variant="small" muted style={{ textAlign: 'center' }}>You’re all caught up</Text>}
              <StoreBanner />
            </View>
          ) : undefined
        }
        contentContainerStyle={[styles.content, { paddingBottom: tabSpace + space.md }]}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.flare} colors={[colors.flare]} />}
        showsVerticalScrollIndicator={false}
      />
      <ReportSheet postId={reporting} onClose={() => setReporting(null)} />
    </SafeAreaView>
  );
}

function StoreBanner() {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/store')} style={styles.banner}>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ color: colors.ember }}>BGYM Store</Text>
        <Text variant="heading" style={{ color: colors.white }}>Fuel your training</Text>
        <Text variant="small" style={{ color: colors.onDarkMuted }}>Protein, creatine, apparel and gear, delivered in Accra.</Text>
      </View>
      <View style={styles.shop}><Text variant="smallBold">Shop</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.sm },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.midnight, borderRadius: radii.lg, padding: space.lg },
  shop: { backgroundColor: colors.flare, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8 },
});
