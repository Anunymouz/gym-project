import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { PlayIcon, SpeakerHighIcon, SpeakerSlashIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors, radii } from '@/theme';

/** expo-video players are controlled by setting properties (outside React state). */
const setPlayerMuted = (player: VideoPlayer, muted: boolean) => {
  player.muted = muted;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * A video in a post: shows the poster until tapped (so scrolling the feed downloads nothing),
 * then plays inline. Tap to pause, speaker button to mute.
 */
export function PostVideo({
  url,
  poster,
  width,
  height,
  durationSec,
}: {
  url: string;
  poster: string;
  width: number;
  height: number;
  durationSec?: number;
}) {
  const [started, setStarted] = useState(false);
  return (
    <View style={[styles.box, { width, height }]}>
      {started ? (
        <Player url={url} width={width} height={height} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play video"
          onPress={() => setStarted(true)}
          style={StyleSheet.absoluteFill}
        >
          <Image
            source={{ uri: poster }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.center}>
            <View style={styles.play}>
              <PlayIcon size={26} color={colors.white} weight="fill" />
            </View>
          </View>
          {durationSec ? (
            <View style={styles.time}>
              <Text variant="smallBold" style={{ color: colors.white }}>
                {clock(durationSec)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

function Player({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  return (
    <>
      <VideoView
        player={player}
        style={{ width, height }}
        contentFit="cover"
        nativeControls={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play' : 'Pause'}
        onPress={() => {
          if (paused) player.play();
          else player.pause();
          setPaused(!paused);
        }}
        style={StyleSheet.absoluteFill}
      >
        {paused && (
          <View style={styles.center}>
            <View style={styles.play}>
              <PlayIcon size={26} color={colors.white} weight="fill" />
            </View>
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn sound on' : 'Mute'}
        onPress={() => {
          setPlayerMuted(player, !muted);
          setMuted(!muted);
        }}
        hitSlop={8}
        style={styles.sound}
      >
        {muted ? (
          <SpeakerSlashIcon size={16} color={colors.white} weight="fill" />
        ) : (
          <SpeakerHighIcon size={16} color={colors.white} weight="fill" />
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.midnight },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(8,10,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  time: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(8,10,26,0.6)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  sound: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(8,10,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
