import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PASS_REFRESH_SECONDS } from '@bgym/shared';
import { OrbitLoader } from '@/components/motion/orbit-loader';
import { Text } from '@/components/ui/text';
import { membershipsApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';
import { QrCode } from './qr-code';

/**
 * The member's check-in QR. A new signed pass is fetched every 30 seconds (each is valid for 60),
 * so a screenshot stops working almost immediately. A bar shows time until the next refresh.
 */
export function LivePass({ membershipId, size = 220 }: { membershipId: string; size?: number }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const progress = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;
    membershipsApi
      .pass(membershipId)
      .then((p) => {
        if (cancelled) return;
        setToken(p.token);
        setError(null);
        progress.value = 1;
        progress.value = withTiming(0, { duration: PASS_REFRESH_SECONDS * 1000, easing: Easing.linear });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your pass'));
    const timer = setTimeout(() => setTick((t) => t + 1), PASS_REFRESH_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimation(progress);
    };
  }, [membershipId, tick, progress]);

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={styles.wrap}>
      <View style={[styles.qr, { width: size + 24, height: size + 24 }]}>
        {token ? (
          <Animated.View key={token} entering={FadeIn.duration(250)}>
            <QrCode value={token} size={size} />
          </Animated.View>
        ) : error ? (
          <Text variant="smallBold" style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>
        ) : (
          <OrbitLoader size={56} />
        )}
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
      <Text variant="small" muted>Code refreshes every {PASS_REFRESH_SECONDS} seconds · screenshots won’t work</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm },
  qr: { borderRadius: radii.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  track: { width: 180, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.flare },
});
