import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowLeftIcon, EnvelopeSimpleIcon } from '@/components/icons';
import { OrbitLoader } from '@/components/motion/orbit-loader';
import { PulseRings } from '@/components/motion/pulse-rings';
import { SuccessCheck } from '@/components/motion/success-check';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { homeFor } from '@/lib/routes';
import { useSession } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

const LENGTH = 6;
type Phase = 'entering' | 'verifying' | 'success' | 'error';

export default function Verify() {
  const { status, pendingEmail, verifyCode, resendCode } = useSession();
  const [cooldown, setCooldown] = useState(30);
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('entering');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const shake = useSharedValue(0);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Navigation follows session state once the success animation has finished.
  if (status !== 'signedOut') return <Redirect href={homeFor(status)} />;
  if (!pendingEmail) return <Redirect href="/sign-in" />;

  async function submit(value: string) {
    setPhase('verifying');
    try {
      // Keep the verifying animation on screen long enough to read, even on a fast connection.
      const [activate] = await Promise.all([verifyCode(value), new Promise((r) => setTimeout(r, 700))]);
      setPhase('success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(activate, 1100);
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'That code didn’t work. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake.set(withSequence(...[10, -10, 8, -8, 4, 0].map((v) => withTiming(v, { duration: 55 }))));
      setCode('');
      input.current?.focus();
    }
  }

  async function resend() {
    try {
      setCooldown(await resendCode());
      setError(null);
      setPhase('entering');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setPhase('error');
    }
  }

  const locked = phase === 'verifying' || phase === 'success';

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back} hitSlop={8} disabled={locked}>
        <ArrowLeftIcon size={22} color={colors.text} />
      </Pressable>

      <Animated.View entering={FadeInDown.duration(420)} style={{ gap: space.md }}>
        <View style={{ marginTop: space.md, alignSelf: 'flex-start' }}>
          <PulseRings size={58} color={colors.flare}>
            <View style={styles.iconBox}>
              <EnvelopeSimpleIcon size={28} color={colors.flare} weight="duotone" />
            </View>
          </PulseRings>
        </View>
        <Text variant="title" accessibilityRole="header">Check your email</Text>
        <Text muted>
          We sent a 6-digit code to <Text variant="bodyBold">{pendingEmail}</Text>
        </Text>
      </Animated.View>

      <Animated.View style={[styles.cells, rowStyle]}>
        <Pressable onPress={() => input.current?.focus()} style={styles.cellsInner} accessibilityLabel={`Code, ${code.length} of 6 digits entered`} disabled={locked}>
          {Array.from({ length: LENGTH }, (_, i) => (
            <CodeCell key={i} index={i} digit={code[i]} active={phase === 'entering' && i === code.length} phase={phase} />
          ))}
        </Pressable>
      </Animated.View>
      <TextInput
        ref={input}
        value={code}
        editable={!locked}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, LENGTH);
          if (digits.length > code.length) void Haptics.selectionAsync();
          setCode(digits);
          if (phase === 'error') setPhase('entering');
          setError(null);
          if (digits.length === LENGTH) void submit(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={LENGTH}
        style={styles.hidden}
      />

      <View style={styles.status} accessibilityLiveRegion="polite">
        {phase === 'verifying' && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.statusRow}>
            <OrbitLoader size={40} />
            <Text variant="bodyBold">Verifying your code…</Text>
          </Animated.View>
        )}
        {phase === 'success' && (
          <Animated.View entering={FadeIn.duration(150)} style={styles.statusRow}>
            <SuccessCheck size={40} />
            <Text variant="bodyBold" style={{ color: colors.success }}>Verified. Welcome to BGYM!</Text>
          </Animated.View>
        )}
        {phase === 'error' && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
        {phase === 'entering' && (
          <View style={styles.resendRow}>
            {cooldown > 0 ? (
              <Text variant="small" muted>Resend code in 0:{String(cooldown).padStart(2, '0')}</Text>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => void resend()} hitSlop={8}>
                <Text variant="smallBold" style={{ color: colors.flare }}>Resend code</Text>
              </Pressable>
            )}
            <Text variant="small" muted> · Check your spam folder</Text>
          </View>
        )}
        {__DEV__ && phase === 'entering' && (
          <Text variant="small" muted style={{ marginTop: 4 }}>Development: the code is printed in the API terminal.</Text>
        )}
      </View>

      <View style={{ marginTop: 'auto' }}>
        <Button title="Verify" loading={phase === 'verifying'} disabled={code.length !== LENGTH || locked} onPress={() => void submit(code)} />
      </View>
    </Screen>
  );
}

function CodeCell({ index, digit, active, phase }: { index: number; digit?: string; active: boolean; phase: Phase }) {
  const pop = useSharedValue(1);
  const caret = useSharedValue(0);
  const wave = useSharedValue(0);
  const done = useSharedValue(0);

  // Digit pops in when typed.
  useEffect(() => {
    if (digit) pop.value = withSequence(withTiming(1.12, { duration: 90 }), withSpring(1, { damping: 12 }));
  }, [digit, pop]);

  // Blinking caret in the next empty cell.
  useEffect(() => {
    if (active) caret.value = withRepeat(withSequence(withTiming(1, { duration: 0 }), withDelay(520, withTiming(0, { duration: 0 })), withDelay(520, withTiming(1, { duration: 0 }))), -1);
    else {
      cancelAnimation(caret);
      caret.value = 0;
    }
  }, [active, caret]);

  // Verifying: a light wave runs across the cells. Success: cells turn green one by one.
  useEffect(() => {
    if (phase === 'verifying') {
      wave.value = withDelay(index * 90, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 })), -1));
    } else {
      cancelAnimation(wave);
      wave.value = withTiming(0, { duration: 150 });
    }
    done.value = phase === 'success' ? withDelay(index * 60, withTiming(1, { duration: 260 })) : withTiming(0, { duration: 150 });
  }, [phase, index, wave, done]);

  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { translateY: -wave.value * 5 }],
    borderColor: done.value > 0 ? interpolateColor(done.value, [0, 1], [colors.border, colors.success]) : active ? colors.flare : interpolateColor(wave.value, [0, 1], [colors.border, colors.flare]),
    backgroundColor: interpolateColor(done.value, [0, 1], [colors.white, colors.successSoft]),
  }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  return (
    <Animated.View style={[styles.cell, active && styles.cellActive, cellStyle]}>
      {digit ? <Text style={styles.digit}>{digit}</Text> : <Animated.View style={[styles.caret, caretStyle]} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.flareSoft, alignItems: 'center', justifyContent: 'center' },
  cells: { marginTop: space.sm },
  cellsInner: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, height: 60, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cellActive: { borderWidth: 2 },
  digit: { fontFamily: fonts.extrabold, fontSize: 26 },
  caret: { width: 2, height: 26, borderRadius: 1, backgroundColor: colors.flare },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  status: { minHeight: 48, justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  resendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
