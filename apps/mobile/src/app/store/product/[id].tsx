import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatGhs, MAX_LINE_QUANTITY, pesewas, type ProductDetail } from '@bgym/shared';
import { GlassButton } from '@/components/glass-button';
import { ArrowLeftIcon, CheckCircleIcon, MinusIcon, PlusIcon, StorefrontIcon, TruckIcon, WifiSlashIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { CartButton } from '@/components/store/cart-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { storeApi } from '@/lib/api';
import { cartStore, useCart } from '@/lib/cart-store';
import { colors, radii, space } from '@/theme';

const ghs = (p: number) => formatGhs(pesewas(p));

/** A product: photos, options (size, flavour), quantity, add to cart. */
export default function Product() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cart = useCart();
  const [p, setP] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    storeApi.product(id).then(
      (d) => {
        setP(d);
        setVariantId((d.variants.find((v) => v.available > 0) ?? d.variants[0])?.id ?? null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load this product.'),
    );
  }, [id]);

  const variant = p?.variants.find((v) => v.id === variantId) ?? null;
  const inCart = cart?.lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
  const max = Math.min(MAX_LINE_QUANTITY, (variant?.available ?? 0) - inCart);

  const add = async () => {
    if (!variant) return;
    setBusy(true);
    setMessage(null);
    try {
      await cartStore.setLine(variant.id, inCart + qty);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAdded(true);
      setQty(1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Couldn’t add to your cart.');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: space.lg, paddingTop: insets.top + 60 }}>
        <EmptyState icon={<WifiSlashIcon size={28} color={colors.flare} weight="duotone" />} title="Product not available" body={error} action={<Button title="Back to the store" variant="dark" onPress={() => router.back()} />} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {p ? (
          <View>
            <FlatList
              data={p.images}
              keyExtractor={(i) => i.url}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item, index }) => <Image source={{ uri: item.url }} placeholder={{ uri: item.thumbUrl }} style={{ width, height: width, backgroundColor: colors.white }} contentFit="cover" transition={200} accessibilityLabel={`${p.title}, photo ${index + 1}`} />}
            />
            {p.images.length > 1 && (
              <View style={styles.dots}>{p.images.map((_, i) => <View key={i} style={[styles.dot, i === page && styles.dotOn]} />)}</View>
            )}
          </View>
        ) : (
          <Skeleton height={width} radius={0} />
        )}
        <View style={styles.body}>
          {!p ? (
            <View style={{ gap: space.md }}><Skeleton width="70%" height={28} /><Skeleton height={80} /></View>
          ) : (
            <Animated.View entering={FadeInDown.duration(300)} style={{ gap: space.lg }}>
              <View style={{ gap: 4 }}>
                {p.brand && <Text variant="label" muted>{p.brand}</Text>}
                <Text variant="title">{p.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text variant="title" style={{ color: variant?.compareAtPricePesewas ? colors.flare : colors.text }}>{variant ? ghs(variant.pricePesewas) : ''}</Text>
                  {variant?.compareAtPricePesewas && <Text muted style={{ textDecorationLine: 'line-through' }}>{ghs(variant.compareAtPricePesewas)}</Text>}
                </View>
              </View>

              {p.variants.length > 1 && (
                <View style={{ gap: space.sm }}>
                  <Text variant="bodyBold">Choose</Text>
                  <View style={styles.options}>
                    {p.variants.map((v) => {
                      const on = v.id === variantId;
                      const out = v.available === 0;
                      return (
                        <Pressable key={v.id} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: out }} disabled={out} onPress={() => { setVariantId(v.id); setQty(1); setAdded(false); }} style={[styles.option, on && styles.optionOn, out && { opacity: 0.45 }]}>
                          <Text variant="smallBold" style={on ? { color: colors.white } : undefined}>{v.name}</Text>
                          {out && <Text style={{ fontSize: 11, color: on ? colors.onDarkMuted : colors.textMuted }}>Sold out</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {variant && variant.available > 0 && variant.available < 5 && <Text variant="smallBold" style={{ color: colors.flare }}>Only {variant.available} left</Text>}

              {p.description && (
                <View style={{ gap: space.sm }}>
                  <Text variant="bodyBold">About this product</Text>
                  <Text style={{ lineHeight: 23 }}>{p.description}</Text>
                </View>
              )}

              <View style={styles.facts}>
                <View style={styles.fact}><StorefrontIcon size={20} color={colors.violet} weight="duotone" /><Text variant="small" style={{ flex: 1 }}>Sold by <Text variant="smallBold">{p.seller}</Text></Text></View>
                <View style={styles.fact}><TruckIcon size={20} color={colors.flare} weight="duotone" /><Text variant="small" style={{ flex: 1 }}>Delivered in Accra and Tema. The fee depends on distance and is shown at checkout.</Text></View>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <GlassButton label="Back" onPress={() => router.back()}><ArrowLeftIcon size={20} color={colors.text} /></GlassButton>
        <CartButton />
      </View>

      {p && variant && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          {message && <Text variant="smallBold" style={{ color: colors.danger, marginBottom: space.sm }}>{message}</Text>}
          {added && (
            <Animated.View entering={FadeIn} style={styles.added}>
              <CheckCircleIcon size={18} color={colors.success} weight="fill" />
              <Text variant="smallBold" style={{ flex: 1 }}>Added to your cart</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/store/cart')}><Text variant="smallBold" style={{ color: colors.flare }}>View cart</Text></Pressable>
            </Animated.View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={styles.qty}>
              <Pressable accessibilityRole="button" accessibilityLabel="Fewer" disabled={qty <= 1} onPress={() => setQty((q) => q - 1)} style={[styles.qtyBtn, qty <= 1 && { opacity: 0.35 }]}><MinusIcon size={16} color={colors.text} weight="bold" /></Pressable>
              <Text variant="bodyBold" accessibilityLabel={`Quantity ${qty}`} style={{ minWidth: 22, textAlign: 'center' }}>{qty}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={qty >= max} onPress={() => setQty((q) => q + 1)} style={[styles.qtyBtn, qty >= max && { opacity: 0.35 }]}><PlusIcon size={16} color={colors.text} weight="bold" /></Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Button title={variant.available === 0 ? 'Sold out' : max <= 0 ? 'All in your cart' : `Add · ${ghs(variant.pricePesewas * qty)}`} disabled={max <= 0} loading={busy} onPress={() => void add()} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { position: 'absolute', bottom: 36, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotOn: { backgroundColor: colors.white, width: 18 },
  body: { marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background, padding: space.lg, paddingTop: space.xl },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: { borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 10 },
  optionOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  facts: { gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.md },
  added: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.sm },
  qty: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 4 },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
