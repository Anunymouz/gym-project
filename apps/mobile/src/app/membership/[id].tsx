import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { MembershipSummary } from '@bgym/shared';
import { Header } from '@/components/header';
import { LivePass } from '@/components/membership/live-pass';
import { SuccessCheck } from '@/components/motion/success-check';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { membershipsApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MembershipScreen() {
  const { id, welcome } = useLocalSearchParams<{ id: string; welcome?: string }>();
  const [m, setM] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    membershipsApi
      .list()
      .then((all) => {
        const found = all.find((x) => x.id === id);
        if (found) {
          setM(found);
          setStarted(Date.parse(found.startsAt) <= Date.now());
        }
        else setError('Membership not found');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
  }, [id]);

  const active = m?.status === 'active' && started;

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: space.lg }}>
      {welcome ? (
        <Animated.View entering={FadeInDown.duration(450)} style={styles.welcome}>
          <Animated.View entering={ZoomIn.springify().damping(12)}><SuccessCheck size={64} /></Animated.View>
          <Text variant="display" style={{ textAlign: 'center' }}>You’re in!</Text>
          {m && <Text muted style={{ textAlign: 'center' }}>Welcome to {m.gym.name}</Text>}
        </Animated.View>
      ) : (
        <Header back title={m?.gym.name ?? 'Membership'} />
      )}

      {!m && !error && <Skeleton height={380} radius={24} />}
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}

      {m && (
        <Animated.View entering={FadeIn.delay(welcome ? 350 : 0).duration(400)} style={styles.card}>
          {active ? (
            <LivePass membershipId={m.id} />
          ) : (
            <View style={styles.inactive}>
              <Text variant="heading">{m.status === 'expired' ? 'This membership has ended' : `Starts on ${fmtDate(m.startsAt)}`}</Text>
              <Text muted style={{ textAlign: 'center' }}>{m.status === 'expired' ? 'Renew to get your check-in code back.' : 'Your check-in code appears on the start date.'}</Text>
            </View>
          )}
          <View style={styles.details}>
            <Detail label="Plan" value={m.plan.name} />
            <Detail label={m.status === 'expired' ? 'Ended' : 'Valid until'} value={fmtDate(m.endsAt)} alignRight />
          </View>
        </Animated.View>
      )}

      {m && (
        <View style={{ gap: space.sm }}>
          {m.status === 'expired' && (
            <Button title="Renew membership" onPress={() => router.push({ pathname: '/gym/[slug]', params: { slug: m.gym.slug } })} />
          )}
          <Button title={welcome ? 'Done' : 'View gym'} variant={welcome ? 'dark' : 'secondary'} onPress={() => (welcome ? router.replace('/home') : router.push({ pathname: '/gym/[slug]', params: { slug: m.gym.slug } }))} />
          {active && <Text variant="small" muted style={{ textAlign: 'center' }}>Show this code at the front desk. It also lives in Me → My memberships.</Text>}
        </View>
      )}
    </Screen>
  );
}

function Detail({ label, value, alignRight }: { label: string; value: string; alignRight?: boolean }) {
  return (
    <View style={{ alignItems: alignRight ? 'flex-end' : 'flex-start' }}>
      <Text variant="small" muted>{label}</Text>
      <Text variant="bodyBold">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { alignItems: 'center', gap: space.sm, marginTop: space.lg },
  card: { backgroundColor: colors.white, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.lg },
  inactive: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  details: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
});
