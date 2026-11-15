import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import type { FeedPost } from '@bgym/shared';
import { DotsThreeIcon, HeartIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { ApiError, feedApi } from '@/lib/api';
import { timeAgo } from '@/lib/time-ago';
import { colors, radii, space } from '@/theme';

/** A gym's post: who and when, text, photos (swipe if several), like and report. */
export function PostCard({ post, now, onReport, showGym = true }: { post: FeedPost; now: number; onReport: (postId: string) => void; showGym?: boolean }) {
  // Photos fill the card's inner width; measured so the card works in any layout.
  const [width, setWidth] = useState(0);
  const [liked, setLiked] = useState(post.likedByMe);
  const [count, setCount] = useState(post.likeCount);
  const [page, setPage] = useState(0);
  const scale = useSharedValue(1);
  const heart = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const toggleLike = async () => {
    const next = !liked;
    // Optimistic: feels instant; undone if the server says no.
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    if (next) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scale.set(withSequence(withSpring(1.3, { damping: 6 }), withSpring(1)));
    }
    try {
      const res = await feedApi.like(post.id, next);
      setLiked(res.likedByMe);
      setCount(res.likeCount);
    } catch (e) {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
      if (e instanceof ApiError && e.status === 403) Alert.alert('Members only', `Join ${post.gym.name} to like its posts.`);
    }
  };

  const photoHeight = !width ? 0 : post.media.length === 1 ? Math.min(width * 1.1, (width * post.media[0]!.height) / post.media[0]!.width) : width;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {showGym ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`Open ${post.gym.name}`} onPress={() => router.push({ pathname: '/gym/[slug]', params: { slug: post.gym.slug } })} style={styles.gym}>
            <Image source={post.gym.coverUrl ? { uri: post.gym.coverUrl } : undefined} style={styles.avatar} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>{post.gym.name}</Text>
              <Text variant="small" muted>{timeAgo(post.createdAt, now)}</Text>
            </View>
          </Pressable>
        ) : (
          <Text variant="small" muted style={{ flex: 1 }}>{timeAgo(post.createdAt, now)}</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={10} onPress={() => onReport(post.id)} style={styles.more}>
          <DotsThreeIcon size={22} color={colors.textMuted} weight="bold" />
        </Pressable>
      </View>

      {post.body && <Text style={styles.body}>{post.body}</Text>}

      {post.media.length > 0 && (
        <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={{ minHeight: width ? undefined : 200 }}>
          {width > 0 && (
          <FlatList
            data={post.media}
            keyExtractor={(m) => m.url}
            horizontal
            pagingEnabled
            scrollEnabled={post.media.length > 1}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            style={{ width, borderRadius: radii.md }}
            renderItem={({ item, index }) => (
              <Image source={{ uri: item.url }} placeholder={{ uri: item.thumbUrl }} style={{ width, height: photoHeight }} contentFit="cover" transition={250} cachePolicy="memory-disk" accessibilityLabel={`Photo ${index + 1} of ${post.media.length}`} />
            )}
          />
          )}
          {post.media.length > 1 && (
            <View style={styles.counter}><Text variant="smallBold" style={{ color: colors.white }}>{page + 1}/{post.media.length}</Text></View>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }} onPress={() => void toggleLike()} hitSlop={8} style={styles.like}>
          <Animated.View style={heart}>
            <HeartIcon size={24} color={liked ? colors.flare : colors.text} weight={liked ? 'fill' : 'regular'} />
          </Animated.View>
          <Text variant="smallBold">{count > 0 ? count : ''}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  gym: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.violetSoft },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 22 },
  counter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(8,10,26,0.6)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
