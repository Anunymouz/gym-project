import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_POST_LENGTH, MAX_POST_PHOTOS, MAX_POST_VIDEO_SECONDS, MAX_STORY_CAPTION, MAX_STORY_VIDEO_SECONDS, type StoryTray } from '@bgym/shared';
import { CommunityRules } from '@/components/feed/community-rules';
import { CameraIcon, ImageSquareIcon, PlayIcon, VideoCameraIcon, XIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { type PickedFile, postsApi, storiesApi, videoApi } from '@/lib/api';
import { feedEvents } from '@/lib/feed-events';
import { storyStore } from '@/lib/story-store';
import { colors, fonts, radii, space } from '@/theme';

type Mode = 'post' | 'story';
type Picked = PickedFile & { kind: 'image' | 'video'; durationSec?: number; width?: number; height?: number };

const minutes = (s: number) => (s >= 60 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`);

/**
 * Create a post (text, up to 4 photos or a video up to 3 minutes) or a story (a photo or a
 * video up to 60 seconds) for a gym where you're a member.
 */
export default function Compose() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(params.mode === 'story' ? 'story' : 'post');
  const [tray, setTray] = useState<StoryTray | null>(() => storyStore.get());
  const [gymId, setGymId] = useState<string | null>(() => storyStore.get()?.postableGyms[0]?.id ?? null);
  const [text, setText] = useState('');
  const [media, setMedia] = useState<Picked[]>([]);
  const [progress, setProgress] = useState<{ label: string; fraction?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void storiesApi.tray().then((t) => {
      storyStore.set(t);
      setTray(t);
      setGymId((g) => g ?? t.postableGyms[0]?.id ?? null);
    }, () => undefined);
  }, []);

  const maxVideo = mode === 'story' ? MAX_STORY_VIDEO_SECONDS : MAX_POST_VIDEO_SECONDS;
  const video = media.find((m) => m.kind === 'video');
  const photos = media.filter((m) => m.kind === 'image');
  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === 'story') setMedia((list) => list.slice(0, 1));
  };

  const toPicked = (a: ImagePicker.ImagePickerAsset): Picked | null => {
    const isVideo = a.type === 'video';
    const durationSec = a.duration ? a.duration / 1000 : undefined;
    if (isVideo && durationSec && durationSec > maxVideo + 1) {
      Alert.alert('Video too long', `${mode === 'story' ? 'Story videos' : 'Videos'} can be up to ${minutes(maxVideo)}. Trim it in your Photos app and try again.`);
      return null;
    }
    return {
      uri: a.uri,
      name: a.fileName ?? (isVideo ? 'video.mp4' : 'photo.jpg'),
      type: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      kind: isVideo ? 'video' : 'image',
      durationSec,
      width: a.width,
      height: a.height,
    };
  };

  const pick = async (what: 'photos' | 'video' | 'camera') => {
    setError(null);
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: what === 'photos' ? ['images'] : what === 'video' ? ['videos'] : ['images', 'videos'],
      allowsMultipleSelection: what === 'photos' && mode === 'post',
      selectionLimit: mode === 'post' ? MAX_POST_PHOTOS - photos.length : 1,
      quality: 0.85,
      exif: false,
      videoMaxDuration: maxVideo,
    };
    let result: ImagePicker.ImagePickerResult;
    if (what === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Camera access needed', 'Allow BGYM to use the camera in Settings to take photos and videos.');
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    if (result.canceled) return;
    const picked = result.assets.map(toPicked).filter((p): p is Picked => p !== null);
    if (picked.length === 0) return;
    if (mode === 'story' || picked.some((p) => p.kind === 'video')) setMedia([picked.find((p) => p.kind === 'video') ?? picked[0]!]);
    else setMedia((list) => [...list.filter((m) => m.kind === 'image'), ...picked].slice(0, MAX_POST_PHOTOS));
  };

  const canShare = !!gymId && !progress && (mode === 'story' ? media.length === 1 : !!text.trim() || media.length > 0);

  const share = async () => {
    if (!gymId || !canShare) return;
    setError(null);
    try {
      let videoId: string | undefined;
      if (video) {
        setProgress({ label: 'Uploading video', fraction: 0 });
        const ready = await videoApi.upload(mode, video, (stage, fraction) => setProgress(stage === 'uploading' ? { label: 'Uploading video', fraction } : { label: 'Getting your video ready' }));
        videoId = ready.id;
      }
      setProgress({ label: mode === 'story' ? 'Sharing your story' : 'Posting' });
      if (mode === 'story') {
        const next = await storiesApi.create({ gymId, caption: text.trim(), photo: video ? undefined : media[0], videoId });
        storyStore.set(next);
      } else {
        const post = await postsApi.create({ gymId, body: text.trim(), photos: video ? [] : photos, videoId });
        feedEvents.posted(post);
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
      setProgress(null);
    }
  };

  const gyms = tray?.postableGyms ?? [];

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 6 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <XIcon size={24} color={colors.text} />
        </Pressable>
        <View style={styles.segment} accessibilityRole="tablist">
          {(['post', 'story'] as const).map((m) => (
            <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => switchMode(m)} style={[styles.segmentItem, mode === m && styles.segmentOn]}>
              <Text variant="smallBold" style={mode === m ? { color: colors.white } : undefined}>{m === 'post' ? 'Post' : 'Story'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ width: 92 }}>
          {tray?.communityAccepted && gyms.length > 0 && <Button title={mode === 'story' ? 'Share' : 'Post'} disabled={!canShare} onPress={() => void share()} />}
        </View>
      </View>

      {!tray ? (
        <ActivityIndicator color={colors.flare} style={{ marginTop: 60 }} />
      ) : gyms.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="heading">Join a gym to post</Text>
          <Text muted style={{ textAlign: 'center' }}>Posts and stories are shared with the members of your gym. Get a membership to join in.</Text>
          <Button title="Find a gym" onPress={() => { router.back(); router.navigate('/gyms'); }} />
        </View>
      ) : !tray.communityAccepted ? (
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          <CommunityRules onAccepted={() => { const next = { ...tray, communityAccepted: true }; storyStore.set(next); setTray(next); }} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {gyms.length > 1 ? (
            <View style={{ gap: space.sm }}>
              <Text variant="label" muted>Share with</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {gyms.map((g) => (
                  <Pressable key={g.id} accessibilityRole="radio" accessibilityState={{ checked: gymId === g.id }} onPress={() => setGymId(g.id)} style={[styles.chip, gymId === g.id && styles.chipOn]}>
                    <Text variant="smallBold" style={gymId === g.id ? { color: colors.white } : undefined}>{g.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : (
            <Text variant="small" muted>Shared with members of <Text variant="smallBold">{gyms[0]!.name}</Text>{mode === 'story' ? ' for 24 hours' : ''}</Text>
          )}

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={mode === 'story' ? 'Add a caption…' : 'Share your progress, a PR, a tip…'}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={mode === 'story' ? MAX_STORY_CAPTION : MAX_POST_LENGTH}
            style={[styles.input, mode === 'story' && { minHeight: 60 }]}
            accessibilityLabel={mode === 'story' ? 'Caption' : 'Post text'}
          />

          {media.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {media.map((m) => (
                <View key={m.uri} style={[styles.thumb, mode === 'story' && styles.storyThumb]}>
                  {m.kind === 'image' ? (
                    <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={styles.videoTile}>
                      <VideoCameraIcon size={30} color={colors.white} weight="duotone" />
                      <Text variant="smallBold" style={{ color: colors.onDarkMuted }} numberOfLines={1}>{m.name}</Text>
                    </View>
                  )}
                  {m.kind === 'video' && (
                    <View style={styles.videoTag}>
                      <PlayIcon size={12} color={colors.white} weight="fill" />
                      {m.durationSec && m.durationSec >= 1 ? <Text variant="smallBold" style={{ color: colors.white }}>{Math.floor(m.durationSec / 60)}:{String(Math.round(m.durationSec % 60)).padStart(2, '0')}</Text> : null}
                    </View>
                  )}
                  <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={() => setMedia((l) => l.filter((x) => x.uri !== m.uri))} hitSlop={8} style={styles.remove}>
                    <XIcon size={12} color={colors.white} weight="bold" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.pickers}>
            <PickButton label="Photos" icon={<ImageSquareIcon size={22} color={colors.violet} weight="duotone" />} disabled={!!video || (mode === 'post' ? photos.length >= MAX_POST_PHOTOS : media.length > 0)} onPress={() => void pick('photos')} />
            <PickButton label="Video" icon={<VideoCameraIcon size={22} color={colors.flare} weight="duotone" />} disabled={media.length > 0} onPress={() => void pick('video')} />
            {Platform.OS !== 'web' && <PickButton label="Camera" icon={<CameraIcon size={22} color={colors.text} weight="duotone" />} disabled={!!video || (mode === 'story' && media.length > 0) || photos.length >= MAX_POST_PHOTOS} onPress={() => void pick('camera')} />}
          </View>
          <Text variant="small" muted>
            {mode === 'post' ? `Up to ${MAX_POST_PHOTOS} photos, or one video up to ${minutes(maxVideo)}.` : `One photo, or a video up to ${minutes(maxVideo)}. Stories disappear after 24 hours.`}
          </Text>
          {error && <Text variant="smallBold" style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text>}
        </ScrollView>
      )}

      {progress && (
        <View style={styles.overlay} accessibilityLiveRegion="polite">
          <View style={styles.progressCard}>
            <ActivityIndicator color={colors.flare} />
            <Text variant="bodyBold">{progress.label}{progress.fraction !== undefined ? ` ${Math.round(progress.fraction * 100)}%` : '…'}</Text>
            {progress.fraction !== undefined && (
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(progress.fraction * 100)}%` }]} /></View>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function PickButton({ label, icon, disabled, onPress }: { label: string; icon: React.ReactNode; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.pick, disabled && { opacity: 0.4 }]}>
      {icon}
      <Text variant="smallBold">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  close: { width: 92, height: 40, justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 3 },
  segmentItem: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999 },
  segmentOn: { backgroundColor: colors.midnight },
  content: { padding: space.lg, gap: space.lg },
  empty: { alignItems: 'center', gap: space.md, padding: space.xl, marginTop: space.xxl },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  input: { minHeight: 120, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: space.lg, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.text, textAlignVertical: 'top' },
  thumb: { width: 104, height: 104, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.midnight },
  storyThumb: { width: 150, height: 266 },
  videoTag: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(8,10,26,0.6)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  videoTile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: space.sm },
  remove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(8,10,26,0.7)', alignItems: 'center', justifyContent: 'center' },
  pickers: { flexDirection: 'row', gap: space.sm },
  pick: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingVertical: space.md },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,26,0.45)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  progressCard: { alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: radii.lg, padding: space.xl, alignItems: 'center', gap: space.md },
  track: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.flare },
});
