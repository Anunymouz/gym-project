import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { BarbellIcon } from '@/components/icons';
import { colors } from '@/theme';

/**
 * Gym cover photo. Gyms upload their own photos; while one loads it fades in, and if there is
 * none (or it fails) a branded cover is shown instead of a broken image.
 */
export function GymCover({ uri, height, name }: { uri: string | null; height: number; name: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!uri && !failed;
  return (
    <View style={{ height, overflow: 'hidden' }}>
      <BrandCover />
      {showPhoto && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={350}
          cachePolicy="memory-disk"
          accessibilityLabel={`Photo of ${name}`}
          onError={() => setFailed(true)}
        />
      )}
      {showPhoto && <LinearGradient colors={['transparent', 'rgba(8,10,26,0.45)']} style={StyleSheet.absoluteFill} />}
    </View>
  );
}

function BrandCover() {
  const id = `grid-${useId().replace(/:/g, '')}`;
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[colors.indigo, colors.midnight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id={id} width={22} height={22} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={0} y2={22} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <Line x1={0} y1={0} x2={22} y2={0} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <View style={styles.glyph}>
        <BarbellIcon size={96} color="rgba(255,138,61,0.22)" weight="duotone" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { position: 'absolute', right: 18, bottom: -10, transform: [{ rotate: '-18deg' }] },
});
