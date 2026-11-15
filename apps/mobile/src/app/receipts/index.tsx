import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatGhs, paymentChannelLabel, pesewas, type ReceiptSummary } from '@bgym/shared';
import { Header } from '@/components/header';
import { CaretRightIcon, ReceiptIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { receiptsApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Receipts() {
  const [items, setItems] = useState<ReceiptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    receiptsApi.list().then(setItems, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
  }, []);

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="Payments & receipts" />
      {!items && !error && [0, 1, 2].map((i) => <Skeleton key={i} height={76} radius={18} />)}
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
      {items?.length === 0 && (
        <EmptyState
          icon={<ReceiptIcon size={28} color={colors.flare} weight="duotone" />}
          title="No payments yet"
          body="When you join a gym, your receipt shows up here and in your email."
          action={<View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button title="Find a gym" onPress={() => router.navigate('/gyms')} /></View>}
        />
      )}
      {items?.map((r, i) => (
        <Animated.View key={r.id} entering={FadeInDown.delay(i * 50).duration(320)}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${r.title}, ${formatGhs(pesewas(r.amountPesewas))}, ${day(r.paidAt)}`} onPress={() => router.push({ pathname: '/receipts/[id]', params: { id: r.id } })} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
            <View style={styles.icon}><ReceiptIcon size={20} color={colors.text} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold" numberOfLines={1}>{r.title}</Text>
              <Text variant="small" muted>{day(r.paidAt)} · {paymentChannelLabel(r.channel)}</Text>
            </View>
            <Text variant="bodyBold">{formatGhs(pesewas(r.amountPesewas))}</Text>
            <CaretRightIcon size={18} color="#9AA0B4" />
          </Pressable>
        </Animated.View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
