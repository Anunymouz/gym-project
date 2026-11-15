import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { formatGhs, pesewas, type ProductCard } from '@bgym/shared';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

/** A product in the store grid: photo, name, price (with the "was" price when on sale). */
export function ProductTile({ product: p, width }: { product: ProductCard; width: number }) {
  const sale = p.compareAtPricePesewas && p.compareAtPricePesewas > p.pricePesewas;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.title}, ${formatGhs(pesewas(p.pricePesewas))}${p.inStock ? '' : ', sold out'}`}
      onPress={() => router.push({ pathname: '/store/product/[id]', params: { id: p.id } })}
      style={({ pressed }) => [styles.tile, { width }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View>
        <Image source={p.thumbUrl ? { uri: p.thumbUrl } : undefined} style={{ width, height: width, backgroundColor: colors.background }} contentFit="cover" transition={200} />
        {sale && <View style={styles.sale}><Text style={styles.saleText}>Sale</Text></View>}
        {!p.inStock && <View style={styles.soldOut}><Text variant="smallBold" style={{ color: colors.white }}>Sold out</Text></View>}
      </View>
      <View style={styles.body}>
        {p.brand && <Text variant="small" muted numberOfLines={1}>{p.brand}</Text>}
        <Text variant="bodyBold" numberOfLines={2} style={{ minHeight: 44 }}>{p.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="bodyBold" style={sale ? { color: colors.flare } : undefined}>{formatGhs(pesewas(p.pricePesewas))}</Text>
          {sale && <Text variant="small" muted style={{ textDecorationLine: 'line-through' }}>{formatGhs(pesewas(p.compareAtPricePesewas!))}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  body: { padding: space.md, gap: 2 },
  sale: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.flare, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  saleText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  soldOut: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,26,0.65)', paddingVertical: 6, alignItems: 'center' },
});
