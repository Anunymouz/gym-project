import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import type { StoryGroup, StoryItem } from '@bgym/shared';
import { ActionSheet, type SheetAction } from '@/components/feed/action-sheet';
import { Avatar } from '@/components/feed/avatar';
import { ReportSheet, type ReportTarget } from '@/components/feed/report-sheet';
import { DotsThreeIcon, EyeIcon, FlagIcon, HeartIcon, ProhibitIcon, TrashIcon, XIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { communityApi, storiesApi } from '@/lib/api';
import { storyStore } from '@/lib/story-store';
import { timeAgo } from '@/lib/time-ago';
import { colors, space } from '@/theme';

const PHOTO_MS = 5000;

/**
 * Full-screen stories, Instagram-style: bars across the top, tap right for next, left for
 * previous, hold to pause. Moves on to the next person's stories, and closes at the end.
 */
export default function StoryViewer() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [groups] = useState<StoryGroup[]>(() => storyStore.get()?.groups ?? []);
  const [g, setG] = useState(() => Math.max(0, groups.findIndex((x) => x.key === key)));
  const group = groups[g];
  // Start at the first story not yet seen (like Instagram).
  const [i, setI] = useState(() => Math.max(0, group?.stories.findIndex((s) => !s.seen) ?? 0));
  const story = group?.stories[i];
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [now] = useState(() => Date.now());
  const progress = useSharedValue(0);
  const paused = useRef(false);

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/home')), []);
  const next = useCallback(() => {
    if (!group) return close();
    if (i < group.stories.length - 1) return setI(i + 1);
    if (g < groups.length - 1) {
      setG(g + 1);
      setI(Math.max(0, groups[g + 1]!.stories.findIndex((s) => !s.seen)));
      return;
    }
    close();
  }, [close, g, group, groups, i]);
  const prev = useCallback(() => {
    if (i > 0) return setI(i - 1);
    if (g > 0) {
      setG(g - 1);
      setI(groups[g - 1]!.stories.length - 1);
      return;
    }
    progress.set(0);
  }, [g, groups, i, progress]);

  const run = useCallback(
    (total: number) => {
      const remaining = (1 - progress.get()) * total;
      progress.set(withTiming(1, { duration: remaining }, (done) => done && scheduleOnRN(next)));
    },
    [next, progress],
  );
  const total = story ? (story.type === 'video' ? Math.max(1, story.durationSec ?? 15) * 1000 : PHOTO_MS) : PHOTO_MS;

  // Each new story: reset the bar, start the clock (videos start when they can play), mark seen.
  useEffect(() => {
    if (!story) return;
    cancelAnimation(progress);
    progress.set(0);
    paused.current = false;
    if (story.type === 'image') run(total);
    if (!group?.mine && !story.seen) void storiesApi.view(story.id).catch(() => undefined);
    storyStore.markSeen(story.id);
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => {
    paused.current = true;
    cancelAnimation(progress);
  };
  const resume = () => {
    if (!paused.current) return;
    paused.current = false;
    run(total);
  };

  if (!group || !story) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', gap: space.md }]}>
        <Text style={{ color: colors.white }}>This story is no longer available.</Text>
        <Pressable onPress={close} accessibilityRole="button"><Text variant="bodyBold" style={{ color: colors.ember }}>Close</Text></Pressable>
      </View>
    );
  }

  const isLiked = liked[story.id] ?? story.likedByMe;
  const author = group.author;
  const toggleLike = async () => {
    const on = !isLiked;
    setLiked((l) => ({ ...l, [story.id]: on }));
    if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await storiesApi.like(story.id, on);
      storyStore.update(story.id, { likedByMe: on });
    } catch {
      setLiked((l) => ({ ...l, [story.id]: !on }));
    }
  };
  const actions: SheetAction[] = group.mine
    ? [
        {
          label: 'Delete story',
          destructive: true,
          icon: <TrashIcon size={22} color={colors.danger} />,
          onPress: () =>
            Alert.alert('Delete this story?', undefined, [
              { text: 'Cancel', style: 'cancel', onPress: resume },
              { text: 'Delete', style: 'destructive', onPress: () => void storiesApi.remove(story.id).then(() => { storyStore.remove(story.id); close(); }) },
            ]),
        },
      ]
    : [
        { label: 'Report story', destructive: true, icon: <FlagIcon size={22} color={colors.danger} />, onPress: () => setReporting({ type: 'story', id: story.id }) },
        ...(author.kind === 'member'
          ? [{
              label: `Block ${author.name}`,
              icon: <ProhibitIcon size={22} color={colors.text} />,
              onPress: () =>
                Alert.alert(`Block ${author.name}?`, 'You won’t see each other’s posts, comments or stories.', [
                  { text: 'Cancel', style: 'cancel', onPress: resume },
                  { text: 'Block', style: 'destructive', onPress: () => void communityApi.block(author.id).then(() => { storyStore.removeAuthor(author.id); close(); }) },
                ]),
            }]
          : []),
      ];

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Media key={story.id} story={story} width={width} height={height} onReady={() => !paused.current && run(total)} />

      {/* Tap zones: left third = back, rest = next; hold anywhere to pause. */}
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable style={{ flex: 1 }} onPress={prev} onLongPress={pause} onPressOut={resume} delayLongPress={180} accessibilityRole="button" accessibilityLabel="Previous story" />
          <Pressable style={{ flex: 2 }} onPress={next} onLongPress={pause} onPressOut={resume} delayLongPress={180} accessibilityRole="button" accessibilityLabel="Next story" />
        </View>
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {group.stories.map((s, n) => (
            <Bar key={s.id} state={n < i ? 'done' : n > i ? 'todo' : 'now'} progress={progress} />
          ))}
        </View>
        <View style={styles.header} pointerEvents="box-none">
          <Avatar author={author} gym={group.gym} size={34} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold" style={{ color: colors.white }} numberOfLines={1}>{group.mine ? 'Your story' : author.kind === 'gym' ? group.gym.name : author.name}</Text>
            <Text variant="small" style={{ color: colors.onDarkMuted }} numberOfLines={1}>{author.kind === 'member' ? `${group.gym.name} · ` : ''}{timeAgo(story.createdAt, now)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="More options" hitSlop={10} onPress={() => { pause(); setMenu(true); }} style={styles.icon}>
            <DotsThreeIcon size={24} color={colors.white} weight="bold" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close} style={styles.icon}>
            <XIcon size={24} color={colors.white} weight="bold" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]} pointerEvents="box-none">
        {story.caption && <Text style={styles.caption}>{story.caption}</Text>}
        {group.mine ? (
          <View style={styles.stats}>
            <EyeIcon size={20} color={colors.white} />
            <Text variant="smallBold" style={{ color: colors.white }}>Seen by {story.viewCount ?? 0}</Text>
            <HeartIcon size={18} color={colors.white} weight="fill" style={{ marginLeft: space.md }} />
            <Text variant="smallBold" style={{ color: colors.white }}>{story.likeCount ?? 0}</Text>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={isLiked ? 'Unlike story' : 'Like story'} accessibilityState={{ selected: isLiked }} onPress={() => void toggleLike()} hitSlop={10} style={styles.like}>
            <HeartIcon size={30} color={isLiked ? colors.flare : colors.white} weight={isLiked ? 'fill' : 'regular'} />
          </Pressable>
        )}
      </View>

      <ActionSheet visible={menu} actions={actions} onClose={() => { setMenu(false); if (!reporting) resume(); }} />
      <ReportSheet target={reporting} onClose={() => { setReporting(null); resume(); }} />
    </View>
  );
}

function Media({ story, width, height, onReady }: { story: StoryItem; width: number; height: number; onReady: () => void }) {
  if (story.type === 'video') return <StoryVideo url={story.url} width={width} height={height} onReady={onReady} />;
  return <Image source={{ uri: story.url }} placeholder={{ uri: story.thumbUrl }} style={{ width, height }} contentFit="contain" transition={150} />;
}

function StoryVideo({ url, width, height, onReady }: { url: string; width: number; height: number; onReady: () => void }) {
  const started = useRef(false);
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && !started.current) {
        started.current = true;
        onReady();
      }
    });
    return () => sub.remove();
  }, [onReady, player]);
  return <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={false} />;
}

function Bar({ state, progress }: { state: 'done' | 'now' | 'todo'; progress: { value: number } }) {
  const fill = useAnimatedStyle(() => ({ width: `${(state === 'done' ? 1 : state === 'todo' ? 0 : progress.value) * 100}%` }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.md, gap: space.sm },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, gap: space.md },
  caption: { color: colors.white, fontSize: 16, lineHeight: 23, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  like: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
