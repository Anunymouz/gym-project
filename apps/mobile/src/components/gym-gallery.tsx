import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassButton } from '@/components/glass-button';
import { GymCover } from '@/components/gym-cover';
import { XIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors, space } from '@/theme';

/**
 * The gym's photos at the top of its page: swipe through them, tap for full screen. Falls
 * back to the cover (or the branded placeholder) when the gym has no photos yet.
 */
export function GymGallery({ photos, coverUrl, height, name }: { photos: string[]; coverUrl: string | null; height: number; name: string }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  if (photos.length === 0) return <GymCover uri={coverUrl} height={height} name={name} />;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <View style={{ height }}>
      <FlatList
        data={photos}
        keyExtractor={(uri) => uri}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item, index: i }) => (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${photos.length} of ${name}. Opens full screen.`} onPress={() => setViewer(i)}>
            <Image source={{ uri: item }} style={{ width, height }} contentFit="cover" transition={300} cachePolicy="memory-disk" />
          </Pressable>
        )}
      />
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(8,10,26,0.5)']} style={[StyleSheet.absoluteFill, { top: height * 0.55 }]} />
      {photos.length > 1 && (
        <View pointerEvents="none" style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {photos.map((uri, i) => (
            <View key={uri} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      )}
      <Viewer photos={photos} start={viewer} onClose={() => setViewer(null)} name={name} />
    </View>
  );
}

function Viewer({ photos, start, onClose, name }: { photos: string[]; start: number | null; onClose: () => void; name: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  return (
    <Modal visible={start !== null} animationType="fade" onRequestClose={onClose} onShow={() => setIndex(start ?? 0)} statusBarTranslucent supportedOrientations={['portrait']}>
      <View style={styles.viewer}>
        {start !== null && (
          <FlatList
            data={photos}
            keyExtractor={(uri) => uri}
            horizontal
            pagingEnabled
            initialScrollIndex={start}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index: i }) => (
              <Image source={{ uri: item }} style={{ width, height }} contentFit="contain" accessibilityLabel={`Photo ${i + 1} of ${photos.length} of ${name}`} />
            )}
          />
        )}
        <View style={[styles.viewerBar, { top: insets.top + space.sm }]}>
          <Text variant="smallBold" style={{ color: colors.white }}>{index + 1} / {photos.length}</Text>
          <GlassButton label="Close photos" onPress={onClose}>
            <XIcon size={20} color={colors.white} weight="bold" />
          </GlassButton>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dots: { position: 'absolute', bottom: 46, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 18, backgroundColor: colors.white },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
