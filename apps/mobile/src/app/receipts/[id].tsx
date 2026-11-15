import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { formatGhs, paymentChannelLabel, pesewas, type Receipt } from '@bgym/shared';
import { Header } from '@/components/header';
import { CheckCircleIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { receiptsApi } from '@/lib/api';
import { colors, space } from '@/theme';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [r, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    receiptsApi.get(id).then(setReceipt, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
  }, [id]);

  const rows: [string, string][] = r
    ? [
        ['Receipt', r.number],
        ['Date', `${day(r.paidAt)}, ${time(r.paidAt)}`],
        ['For', r.title],
        ...(r.period ? ([['Membership', `${day(r.period.startsAt)} – ${day(r.period.endsAt)}`]] as [string, string][]) : []),
        ['Paid with', paymentChannelLabel(r.channel)],
        ['Paid by', r.member.name ?? r.member.email],
      ]
    : [];

  const share = () => {
    if (!r) return;
    const text = [`BGYM receipt ${r.number}`, ...rows.slice(1).map(([k, v]) => `${k}: ${v}`), `Total: ${formatGhs(pesewas(r.amountPesewas))}`, `Reference: ${r.reference}`].join('\n');
    void Share.share({ message: text, title: `Receipt ${r.number}` });
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="Receipt" />
      {!r && !error && <Skeleton height={420} radius={22} />}
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
      {r && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
          <View style={styles.top}>
            <CheckCircleIcon size={40} color={colors.success} weight="fill" />
            <Text variant="display" style={{ marginTop: space.sm }}>{formatGhs(pesewas(r.amountPesewas))}</Text>
            <Text variant="smallBold" style={{ color: colors.success }}>Paid</Text>
            {r.gym && <Text variant="small" muted style={{ textAlign: 'center', marginTop: 4 }}>To {r.gym.name}, {r.gym.addressText}, through BGYM</Text>}
          </View>
          <View style={styles.rows}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text variant="small" muted>{k}</Text>
                <Text variant="smallBold" style={{ flexShrink: 1, textAlign: 'right' }} selectable>{v}</Text>
              </View>
            ))}
            {/* The full payment reference is long: on its own line so it never overflows. */}
            <View style={{ gap: 2 }}>
              <Text variant="small" muted>Payment reference</Text>
              <Text variant="small" style={{ fontSize: 12 }} selectable>{r.reference}</Text>
            </View>
          </View>
        </Animated.View>
      )}
      {r && <Button title="Share receipt" variant="secondary" onPress={share} />}
      {r && <Text variant="small" muted style={{ textAlign: 'center' }}>We also emailed this receipt to {r.member.email}.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  top: { alignItems: 'center', padding: space.xl, borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: colors.border },
  rows: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
});
