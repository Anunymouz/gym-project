import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { MapPinIcon, NavigationArrowIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

export type Point = { latitude: number; longitude: number };

/** Web preview: native maps aren't available, so use the browser's location (the phone app shows a map). */
export function LocationPicker({ value, onChange, height = 200 }: { value: Point | null; onChange: (p: Point) => void; height?: number }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const pos = await Location.getCurrentPositionAsync({});
      onChange({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      setError('Couldn’t get your location. Allow location access in the browser.');
    } finally {
      setLocating(false);
    }
  };
  return (
    <View style={[styles.wrap, { minHeight: height }]}>
      <MapPinIcon size={36} color={colors.flare} weight="fill" />
      {value ? (
        <>
          <Text variant="bodyBold">Pin set</Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${value.latitude},${value.longitude}`)}>
            <Text variant="small" style={{ color: colors.flare }}>{value.latitude.toFixed(5)}, {value.longitude.toFixed(5)} · check on the map</Text>
          </Pressable>
        </>
      ) : (
        <Text muted style={{ textAlign: 'center' }}>In the app you drop a pin on a map. Here, use your current location.</Text>
      )}
      <Pressable accessibilityRole="button" onPress={() => void locate()} style={styles.btn}>
        {locating ? <ActivityIndicator color={colors.white} /> : <NavigationArrowIcon size={18} color={colors.white} weight="fill" />}
        <Text variant="smallBold" style={{ color: colors.white }}>Use my location</Text>
      </Pressable>
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

export async function describe(): Promise<string | null> {
  return null;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.midnight, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginTop: space.sm },
});
