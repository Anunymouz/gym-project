import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { Redirect, router } from 'expo-router';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { SEARCH_RADII_KM } from '@bgym/shared';
import { CaretRightIcon, CrosshairIcon, ShoppingBagIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { homeFor } from '@/lib/routes';
import { useSession, type SearchArea } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

/** Used when location permission is declined, until the person picks an area (Phase 1 adds search). */
const DEFAULT_AREA = { lat: 5.6357, lng: -0.1573, label: 'East Legon, Accra' };

type LocState = { kind: 'locating' } | { kind: 'found'; lat: number; lng: number; label: string } | { kind: 'fallback'; reason: string };

export default function LocationStep() {
  const { status, completeOnboarding } = useSession();
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [loc, setLoc] = useState<LocState>({ kind: 'locating' });
  // While finishing, this screen navigates itself (to Gyms or the Store), so the guard stands down.
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setLoc({ kind: 'fallback', reason: 'Location is off' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      const label = [place?.district ?? place?.subregion, place?.city].filter(Boolean).join(', ') || 'Your current location';
      if (!cancelled) setLoc({ kind: 'found', lat: pos.coords.latitude, lng: pos.coords.longitude, label });
    })().catch(() => !cancelled && setLoc({ kind: 'fallback', reason: "Couldn't get your location" }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== 'needsOnboarding' && !finishing) return <Redirect href={homeFor(status)} />;

  const area: SearchArea =
    loc.kind === 'found' ? { lat: loc.lat, lng: loc.lng, label: loc.label, radiusKm } : { ...DEFAULT_AREA, radiusKm };

  async function finish(next: '/gyms' | '/store') {
    setFinishing(true);
    await completeOnboarding(area);
    router.replace('/gyms');
    if (next === '/store') router.push('/store');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">Find gyms near you</Text>
      <Text muted>We show partner gyms inside the distance you choose.</Text>

      <RadiusGraphic radiusKm={radiusKm} />

      <View style={styles.locCard}>
        <View style={styles.locIcon}>
          <CrosshairIcon size={20} color={colors.violet} weight="bold" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{loc.kind === 'found' ? loc.label : loc.kind === 'locating' ? 'Finding your location…' : DEFAULT_AREA.label}</Text>
          <Text variant="small" muted>
            {loc.kind === 'found' ? 'Using your current location' : loc.kind === 'locating' ? 'This only takes a moment' : `${loc.reason} · showing a default area`}
          </Text>
        </View>
      </View>

      <Text variant="bodyBold">Search radius</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {SEARCH_RADII_KM.map((km) => {
          const on = km === radiusKm;
          return (
            <Pressable
              key={km}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setRadiusKm(km)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && { color: colors.white }]}>{km} km</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 'auto', gap: space.md }}>
        <Button title={`Show gyms within ${radiusKm} km`} disabled={loc.kind === 'locating'} onPress={() => void finish('/gyms')} />
        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text variant="small" muted>or just shopping?</Text>
          <View style={styles.rule} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => void finish('/store')} style={({ pressed }) => [styles.store, pressed && { opacity: 0.9 }]}>
          <View style={styles.storeIcon}>
            <ShoppingBagIcon size={22} color={colors.white} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold" style={{ color: colors.white }}>Go to the BGYM Store</Text>
            <Text variant="small" style={{ color: colors.onDarkMuted }}>No gym needed: supplements, apparel & gear</Text>
          </View>
          <CaretRightIcon size={20} color={colors.white} />
        </Pressable>
      </View>
    </Screen>
  );
}

/** Illustrative radius view (the live map arrives with Google Maps in Phase 1). */
function RadiusGraphic({ radiusKm }: { radiusKm: number }) {
  const r = 30 + (SEARCH_RADII_KM.indexOf(radiusKm as (typeof SEARCH_RADII_KM)[number]) + 1) * 14;
  const pins: [number, number][] = [[-44, -30], [38, -46], [56, 24], [-18, 52], [-70, 12], [84, -70], [-96, -64]];
  return (
    <View style={styles.graphic} accessibilityLabel={`Search radius ${radiusKm} kilometres`}>
      <RadarSweep />
      <Svg width="100%" height="100%" viewBox="-160 -105 320 210">
        {[30, 60, 90, 120, 150].map((ring) => (
          <Circle key={ring} r={ring} fill="none" stroke="#DCE3DA" strokeWidth={1} />
        ))}
        <Circle r={r} fill="rgba(108,92,231,0.08)" stroke={colors.violet} strokeWidth={2} strokeDasharray="6 5" />
        {pins.map(([x, y], i) => {
          const inside = Math.hypot(x, y) <= r;
          return (
            <G key={i} transform={`translate(${x} ${y})`}>
              <Path d="M0 0c-6-8-9-12-9-16a9 9 0 0 1 18 0c0 4-3 8-9 16z" fill={inside ? colors.flare : colors.midnight} opacity={inside ? 1 : 0.35} />
              <Circle cy={-16} r={3.4} fill={colors.white} />
            </G>
          );
        })}
        <Circle r={13} fill="rgba(108,92,231,0.18)" />
        <Circle r={7} fill={colors.violet} stroke={colors.white} strokeWidth={3} />
      </Svg>
    </View>
  );
}

/** A slow radar sweep around the person's position: "scanning for gyms". */
function RadarSweep() {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const a = (40 * Math.PI) / 180;
  return (
    <Animated.View pointerEvents="none" style={[styles.sweep, style]}>
      <Svg width={300} height={300} viewBox="-150 -150 300 300">
        <Defs>
          <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="-0.6">
            <Stop offset="0" stopColor={colors.violet} stopOpacity={0.28} />
            <Stop offset="1" stopColor={colors.violet} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`M0 0 L150 0 A150 150 0 0 0 ${150 * Math.cos(a)} ${-150 * Math.sin(a)} Z`} fill="url(#sweep)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', width: 300, height: 300, left: '50%', top: '50%', marginLeft: -150, marginTop: -150 },
  graphic: { height: 210, borderRadius: radii.lg, backgroundColor: '#EEF2EC', overflow: 'hidden', marginVertical: space.sm },
  locCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  locIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  store: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.midnight, borderRadius: radii.lg, padding: space.md },
  storeIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.flare, alignItems: 'center', justifyContent: 'center' },
});
