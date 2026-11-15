import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { type Region } from 'react-native-maps';
import { MapPinIcon, NavigationArrowIcon } from '@/components/icons';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

export type Point = { latitude: number; longitude: number };
const ACCRA: Point = { latitude: 5.6037, longitude: -0.187 };
const ZOOM = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

/**
 * Drop the pin where the rider should come: move the map under the pin, or jump to where you
 * are. The pin stays in the middle (easier than dragging a marker with a thumb).
 */
export function LocationPicker({ value, onChange, height = 300 }: { value: Point | null; onChange: (p: Point) => void; height?: number }) {
  const map = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const locate = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Location is off', 'Allow BGYM to use your location, or move the map to your spot.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      map.current?.animateToRegion({ ...p, ...ZOOM }, 500);
      onChange(p);
    } catch {
      Alert.alert('Couldn’t find you', 'Move the map to your spot instead.');
    } finally {
      setLocating(false);
    }
  };
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...(value ?? ACCRA), ...(value ? ZOOM : { latitudeDelta: 0.08, longitudeDelta: 0.08 }) }}
        onRegionChangeComplete={(r: Region) => onChange({ latitude: r.latitude, longitude: r.longitude })}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        accessibilityLabel="Map: move it so the pin is on your delivery spot"
      />
      <View pointerEvents="none" style={styles.pinWrap}>
        <MapPinIcon size={44} color={colors.flare} weight="fill" />
        <View style={styles.pinShadow} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Use my location" onPress={() => void locate()} style={styles.locate}>
        {locating ? <ActivityIndicator color={colors.flare} /> : <NavigationArrowIcon size={20} color={colors.flare} weight="fill" />}
      </Pressable>
      <View pointerEvents="none" style={styles.hint}><Text variant="smallBold" style={{ color: colors.white }}>Move the map to put the pin on your gate</Text></View>
    </View>
  );
}

/** A readable address for the pin (native only), to start the address text. */
export async function describe(p: Point): Promise<string | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync(p);
    if (!r) return null;
    return [r.name !== r.street ? r.name : null, r.street, r.district ?? r.subregion, r.city].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.violetSoft },
  pinWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -22, marginTop: -44, alignItems: 'center' },
  pinShadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: -2 },
  locate: { position: 'absolute', right: space.md, bottom: space.md, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  hint: { position: 'absolute', top: space.md, alignSelf: 'center', backgroundColor: 'rgba(8,10,26,0.7)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
