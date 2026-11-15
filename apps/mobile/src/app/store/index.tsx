import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProductCard, StoreCategory } from '@bgym/shared';
import { Header } from '@/components/header';
import { MagnifyingGlassIcon, StorefrontIcon, WifiSlashIcon, XIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { CartButton } from '@/components/store/cart-button';
import { ProductTile } from '@/components/store/product-tile';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { storeApi } from '@/lib/api';
import { colors, fonts, radii, space } from '@/theme';

/** The BGYM Store: browse by category or search. No gym needed to shop. */
export default function Store() {
  const { width } = useWindowDimensions();
  const tile = (Math.min(width, 640) - space.lg * 2 - space.md) / 2;
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [category, setCategory] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);
  const search = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (cat: string | undefined, q: string) => {
    try {
      const page = await storeApi.products({ category: cat, q: q.trim() || undefined });
      setProducts(page.products);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the store.');
    }
  }, []);

  useEffect(() => {
    storeApi.categories().then(setCategories, () => undefined);
    storeApi.products({}).then(
      (page) => {
        setProducts(page.products);
        setCursor(page.nextCursor);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load the store.'),
    );
  }, []);

  const pick = (slug: string | undefined) => {
    setCategory(slug);
    setProducts(null);
    void load(slug, query);
  };
  const onSearch = (text: string) => {
    setQuery(text);
    if (search.current) clearTimeout(search.current);
    search.current = setTimeout(() => void load(category, text), 300);
  };
  const more = async () => {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await storeApi.products({ category, q: query.trim() || undefined, cursor });
      setProducts((l) => [...(l ?? []), ...page.products.filter((p) => !l?.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    } finally {
      loadingMore.current = false;
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={products ?? []}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingTop: space.sm }}>
            <Header back title="BGYM Store" right={<CartButton />} />
            <View style={styles.search}>
              <MagnifyingGlassIcon size={19} color={colors.textMuted} />
              <TextInput value={query} onChangeText={onSearch} placeholder="Search protein, creatine, dumbbells…" placeholderTextColor={colors.textMuted} style={styles.searchInput} returnKeyType="search" accessibilityLabel="Search the store" />
              {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onSearch('')} hitSlop={8}><XIcon size={16} color={colors.textMuted} /></Pressable>}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {[{ slug: undefined as string | undefined, name: 'All' }, ...categories].map((c) => {
                const on = category === c.slug;
                return (
                  <Pressable key={c.slug ?? 'all'} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pick(c.slug)} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && { color: colors.white }]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {!products && !error && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} width={tile} height={tile + 90} radius={radii.lg} />)}</View>
            )}
            {error && <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Couldn’t load the store" body={error} />}
            {products?.length === 0 && <EmptyState icon={<StorefrontIcon size={28} color={colors.flare} weight="duotone" />} title={query ? 'Nothing matches' : 'Nothing here yet'} body={query ? 'Try another word, or browse a category.' : 'New products are on their way.'} />}
          </View>
        }
        renderItem={({ item }) => <ProductTile product={item} width={tile} />}
        onEndReached={() => void more()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(category, query).finally(() => setRefreshing(false)); }} tintColor={colors.flare} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { height: 46, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text, height: 44 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
