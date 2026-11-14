import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { formatGhs, pesewas } from '@bgym/shared';
import { Header, IconButton } from '@/components/header';
import { BellIcon, MagnifyingGlassIcon, MapPinIcon, WifiSlashIcon } from '@/components/icons';
import { StoreBar } from '@/components/store-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { fetchNearbyGyms, type NearbyGym } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, radii, space } from '@/theme';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; gyms: NearbyGym[] };

export default function Gyms() {
  const { area } = useSession();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const [attempt, setAttempt] = useState(0);

  // Fetch whenever the search area changes or the person retries / pulls to refresh.
  useEffect(() => {
    if (!area) return;
    let cancelled = false;
    fetchNearbyGyms({ lat: area.lat, lng: area.lng, radiusKm: area.radiusKm })
      .then((gyms) => !cancelled && setState({ kind: 'loaded', gyms }))
      .catch((e: unknown) => !cancelled && setState({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong' }))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [area, attempt]);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <Header title="Gyms" right={<IconButton label="Notifications"><BellIcon size={21} color={colors.text} /></IconButton>} />
      <View style={styles.search}>
        <MagnifyingGlassIcon size={19} color="#9AA0B4" />
        <Text muted>Search gyms, areas…</Text>
      </View>
      <View style={styles.areaRow}>
        <MapPinIcon size={17} color={colors.violet} weight="fill" />
        <Text variant="smallBold" style={{ flex: 1 }}>{area?.label}</Text>
        <View style={styles.pill}>
          <Text variant="smallBold">Within {area?.radiusKm} km</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      {state.kind === 'loading' ? (
        <View style={styles.pad}>{header}<ActivityIndicator color={colors.flare} style={{ marginTop: space.xl }} /></View>
      ) : state.kind === 'error' ? (
        <View style={styles.pad}>
          {header}
          <EmptyState
            icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />}
            title="Couldn't load gyms"
            body={state.message}
            action={<View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button title="Try again" variant="dark" onPress={retry} /></View>}
          />
        </View>
      ) : (
        <FlatList
          data={state.gyms}
          keyExtractor={(g) => g.id}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.pad, { paddingBottom: 120 }]}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.flare} onRefresh={() => { setRefreshing(true); setAttempt((n) => n + 1); }} />}
          ListEmptyComponent={
            <EmptyState icon={<MapPinIcon size={28} color={colors.flare} weight="duotone" />} title="No gyms in this radius yet" body="Try a bigger radius. New gyms join BGYM every week." />
          }
          renderItem={({ item }) => <GymCard gym={item} />}
        />
      )}
      <StoreBar />
    </SafeAreaView>
  );
}

function GymCard({ gym }: { gym: NearbyGym }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${gym.name}, ${gym.distanceKm} kilometres away`} style={({ pressed }) => [styles.card, pressed && { opacity: 0.94 }]}>
      <LinearGradient colors={[colors.indigo, colors.midnight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
        <Text style={styles.coverInitial}>{gym.name.charAt(0)}</Text>
        <View style={styles.distance}>
          <Text variant="smallBold" style={{ color: colors.white }}>{gym.distanceKm} km</Text>
        </View>
      </LinearGradient>
      <View style={{ padding: space.md, gap: 3 }}>
        <Text variant="heading">{gym.name}</Text>
        <Text variant="small" muted>{gym.addressText} · {gym.facilities.slice(0, 3).join(' · ')}</Text>
        {gym.fromPricePesewas != null && (
          <Text style={{ marginTop: 4 }}>
            from <Text variant="bodyBold" style={{ color: colors.flare }}>{formatGhs(pesewas(gym.fromPricePesewas))}</Text>
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: space.lg, paddingTop: space.sm },
  search: { height: 46, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5 },
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cover: { height: 120, justifyContent: 'center', paddingHorizontal: space.lg },
  coverInitial: { fontSize: 64, lineHeight: 70, fontFamily: 'Outfit_800ExtraBold', color: 'rgba(255,255,255,0.14)' },
  distance: { position: 'absolute', right: 12, top: 12, backgroundColor: 'rgba(13,16,40,0.6)', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
});
