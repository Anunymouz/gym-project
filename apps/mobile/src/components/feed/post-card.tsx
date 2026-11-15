import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import type { FeedPost } from '@bgym/shared';
import { ChatCircleIcon, DotsThreeIcon, FlagIcon, HeartIcon, ProhibitIcon, ShareFatIcon, TrashIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { ApiError, communityApi, feedApi, postsApi } from '@/lib/api';
import { sharePost } from '@/lib/share';
import { timeAgo } from '@/lib/time-ago';
import { colors, radii, space } from '@/theme';
import { ActionSheet, type SheetAction } from './action-sheet';
import { Avatar } from './avatar';
import { PostVideo } from './post-video';
import type { ReportTarget } from './report-sheet';

export interface PostCardEvents {
  onReport: (target: ReportTarget) => void;
  /** The post was deleted, or its author blocked: drop it from the list. */
  onGone?: (post: FeedPost, reason: 'deleted' | 'blocked') => void;
}

/** A post: who and when, text, photos or a video, then like, comment and share. */
export function PostCard({ post, now, onReport, onGone, showGym = true, openable = true }: { post: FeedPost; now: number; showGym?: boolean; openable?: boolean } & PostCardEvents) {
  // Media fill the card's inner width; measured so the card works in any layout.
  const [width, setWidth] = useState(0);
  const [liked, setLiked] = useState(post.likedByMe);
  const [count, setCount] = useState(post.likeCount);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(false);
  const scale = useSharedValue(1);
  const heart = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const member = post.author.kind === 'member' ? post.author : null;

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

  const openPost = () => {
    if (openable) router.push({ pathname: '/post/[id]', params: { id: post.id } });
  };
  const confirmDelete = () =>
    Alert.alert('Delete this post?', 'It will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void postsApi.remove(post.id).then(() => onGone?.(post, 'deleted'), (e: unknown) => Alert.alert('Couldn’t delete', e instanceof Error ? e.message : 'Try again.')),
      },
    ]);
  const confirmBlock = () =>
    member &&
    Alert.alert(`Block ${member.name}?`, 'You won’t see each other’s posts, comments or stories. They won’t be told. You can unblock them from Me.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void communityApi.block(member.id).then(() => onGone?.(post, 'blocked'), () => Alert.alert('Couldn’t block', 'Try again.')) },
    ]);

  const actions: SheetAction[] = post.mine
    ? [{ label: 'Delete post', destructive: true, icon: <TrashIcon size={22} color={colors.danger} />, onPress: confirmDelete }]
    : [
        { label: 'Report post', destructive: true, icon: <FlagIcon size={22} color={colors.danger} />, onPress: () => onReport({ type: 'post', id: post.id }) },
        ...(member ? [{ label: `Block ${member.name}`, icon: <ProhibitIcon size={22} color={colors.text} />, onPress: () => void confirmBlock() }] : []),
      ];

  const first = post.media[0];
  const mediaHeight = !width || !first ? 0 : post.media.length === 1 ? Math.min(width * 1.25, (width * first.height) / first.width) : width;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {showGym || member ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={member ? `${member.name}, at ${post.gym.name}` : `Open ${post.gym.name}`}
            onPress={() => (member ? openPost() : router.push({ pathname: '/gym/[slug]', params: { slug: post.gym.slug } }))}
            style={styles.who}
          >
            <Avatar author={post.author} gym={post.gym} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>{member ? member.name : post.gym.name}</Text>
              <Text variant="small" muted numberOfLines={1}>{member && showGym ? `${post.gym.name} · ` : ''}{timeAgo(post.createdAt, now)}</Text>
            </View>
          </Pressable>
        ) : (
          <Text variant="small" muted style={{ flex: 1 }}>{timeAgo(post.createdAt, now)}</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={10} onPress={() => setMenu(true)} style={styles.more}>
          <DotsThreeIcon size={22} color={colors.textMuted} weight="bold" />
        </Pressable>
      </View>

      {post.body && (
        <Pressable onPress={openPost} disabled={!openable}>
          <Text style={styles.body}>{post.body}</Text>
        </Pressable>
      )}

      {first && (
        <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={{ minHeight: width ? undefined : 200 }}>
          {width > 0 && first.type === 'video' && <PostVideo url={first.url} poster={first.thumbUrl} width={width} height={mediaHeight} durationSec={first.durationSec} />}
          {width > 0 && first.type === 'image' && (
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
                <Image source={{ uri: item.url }} placeholder={{ uri: item.thumbUrl }} style={{ width, height: mediaHeight }} contentFit="cover" transition={250} cachePolicy="memory-disk" accessibilityLabel={`Photo ${index + 1} of ${post.media.length}`} />
              )}
            />
          )}
          {post.media.length > 1 && (
            <View style={styles.counter}><Text variant="smallBold" style={{ color: colors.white }}>{page + 1}/{post.media.length}</Text></View>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }} onPress={() => void toggleLike()} hitSlop={8} style={styles.action}>
          <Animated.View style={heart}>
            <HeartIcon size={24} color={liked ? colors.flare : colors.text} weight={liked ? 'fill' : 'regular'} />
          </Animated.View>
          {count > 0 && <Text variant="smallBold">{count}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Comments${post.commentCount ? `, ${post.commentCount}` : ''}`} onPress={openPost} disabled={!openable} hitSlop={8} style={styles.action}>
          <ChatCircleIcon size={24} color={colors.text} />
          {post.commentCount > 0 && <Text variant="smallBold">{post.commentCount}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={() => void sharePost(post)} hitSlop={8} style={styles.action}>
          <ShareFatIcon size={23} color={colors.text} />
        </Pressable>
      </View>

      <ActionSheet visible={menu} actions={actions} onClose={() => setMenu(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 22 },
  counter: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(8,10,26,0.6)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
});
