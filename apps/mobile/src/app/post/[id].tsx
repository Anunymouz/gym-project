import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_COMMENT_LENGTH, type FeedPost, type PostComment } from '@bgym/shared';
import { ActionSheet, type SheetAction } from '@/components/feed/action-sheet';
import { Avatar } from '@/components/feed/avatar';
import { CommunityRules } from '@/components/feed/community-rules';
import { PostCard } from '@/components/feed/post-card';
import { ReportSheet, type ReportTarget } from '@/components/feed/report-sheet';
import { Header } from '@/components/header';
import { ChatCircleIcon, FlagIcon, PaperPlaneRightIcon, TrashIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { ApiError, postsApi } from '@/lib/api';
import { timeAgo } from '@/lib/time-ago';
import { colors, fonts, radii, space } from '@/theme';

/** One post with its comments (opened from the feed, a shared link or a notification). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [needsRules, setNeedsRules] = useState(false);
  const [menuFor, setMenuFor] = useState<PostComment | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [now] = useState(() => Date.now());
  const list = useRef<FlatList<PostComment>>(null);

  useEffect(() => {
    let live = true;
    Promise.all([postsApi.get(id), postsApi.comments(id)]).then(
      ([p, page]) => {
        if (!live) return;
        setPost(p);
        setComments(page.comments);
        setCursor(page.nextCursor);
      },
      (e: unknown) =>
        live && setMissing(e instanceof ApiError && e.status === 404 ? 'This post isn’t available. It may have been deleted, or it’s only for members of that gym.' : e instanceof Error ? e.message : 'Couldn’t load this post.'),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const more = async () => {
    if (!cursor) return;
    const page = await postsApi.comments(id, cursor).catch(() => null);
    if (!page) return;
    setComments((c) => [...c, ...page.comments.filter((n) => !c.some((x) => x.id === n.id))]);
    setCursor(page.nextCursor);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const c = await postsApi.comment(id, body);
      setComments((list) => [...list, c]);
      setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
      setDraft('');
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && /community rules/i.test(e.message)) setNeedsRules(true);
      else Alert.alert('Couldn’t comment', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const removeComment = (c: PostComment) =>
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void postsApi.removeComment(c.id).then(
            (r) => {
              setComments((l) => l.filter((x) => x.id !== c.id));
              setPost((p) => (p ? { ...p, commentCount: r.commentCount } : p));
            },
            () => Alert.alert('Couldn’t delete', 'Try again.'),
          ),
      },
    ]);
  const commentActions: SheetAction[] = menuFor
    ? [
        ...(menuFor.canDelete ? [{ label: 'Delete comment', destructive: true, icon: <TrashIcon size={22} color={colors.danger} />, onPress: () => removeComment(menuFor) }] : []),
        { label: 'Report comment', destructive: true, icon: <FlagIcon size={22} color={colors.danger} />, onPress: () => setReporting({ type: 'comment', id: menuFor.id }) },
      ]
    : [];

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 4 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <Header title={post?.author.kind === 'member' ? 'Post' : (post?.gym.name ?? 'Post')} back />
      </View>

      {missing ? (
        <View style={{ padding: space.lg }}>
          <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Post not available" body={missing} />
        </View>
      ) : !post ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          <Skeleton height={320} radius={radii.lg} />
          <Skeleton height={60} radius={radii.md} />
        </View>
      ) : (
        <FlatList
          ref={list}
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}
          ListHeaderComponent={
            <View style={{ gap: space.lg, marginBottom: space.sm }}>
              <PostCard post={post} now={now} openable={false} onReport={setReporting} onGone={() => router.back()} />
              <Text variant="heading">Comments</Text>
              {comments.length === 0 && (
                <View style={styles.noComments}>
                  <ChatCircleIcon size={26} color={colors.textMuted} weight="duotone" />
                  <Text muted>No comments yet. Say something encouraging!</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.comment}>
              <Avatar author={{ kind: 'member', ...item.author }} gym={post.gym} size={34} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="small"><Text variant="smallBold">{item.author.name}</Text>  <Text variant="small" muted>{timeAgo(item.createdAt, now)}</Text></Text>
                <Text>{item.body}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Comment options" hitSlop={8} onPress={() => setMenuFor(item)} style={{ padding: 4 }}>
                <Text muted style={{ fontSize: 18, lineHeight: 18 }}>⋯</Text>
              </Pressable>
            </View>
          )}
          onEndReached={() => void more()}
          onEndReachedThreshold={0.4}
        />
      )}

      {post && needsRules && (
        <View style={styles.rules}>
          <CommunityRules onAccepted={() => { setNeedsRules(false); void send(); }} />
        </View>
      )}

      {post && !needsRules && (
        <View style={[styles.composer, { paddingBottom: insets.bottom + space.sm }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_COMMENT_LENGTH}
            multiline
            style={styles.input}
            accessibilityLabel="Comment"
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send comment" disabled={!draft.trim() || sending} onPress={() => void send()} style={[styles.send, (!draft.trim() || sending) && { opacity: 0.4 }]}>
            <PaperPlaneRightIcon size={20} color={colors.white} weight="fill" />
          </Pressable>
        </View>
      )}

      <ActionSheet visible={menuFor !== null} actions={commentActions} onClose={() => setMenuFor(null)} />
      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  noComments: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  comment: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  rules: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,26,0.45)', justifyContent: 'center', padding: space.lg },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: colors.background, borderRadius: 22, paddingHorizontal: space.lg, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.flare, alignItems: 'center', justifyContent: 'center' },
});
