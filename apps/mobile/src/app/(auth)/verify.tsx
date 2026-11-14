import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ArrowLeftIcon, EnvelopeSimpleIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

const LENGTH = 6;

export default function Verify() {
  const { status, pendingEmail, verifyCode } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  // Navigation follows session state: once verified, the session moves to onboarding.
  if (status === 'needsOnboarding') return <Redirect href="/onboarding/location" />;
  if (!pendingEmail) return <Redirect href="/sign-in" />;

  async function submit(value = code) {
    setBusy(true);
    try {
      await verifyCode(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back} hitSlop={8}>
        <ArrowLeftIcon size={22} color={colors.text} />
      </Pressable>
      <View style={styles.iconBox}>
        <EnvelopeSimpleIcon size={28} color={colors.flare} weight="duotone" />
      </View>
      <Text variant="title">Check your email</Text>
      <Text muted>
        We sent a 6-digit code to <Text variant="bodyBold">{pendingEmail}</Text>
      </Text>

      <Pressable onPress={() => input.current?.focus()} style={styles.cells} accessibilityLabel="Enter the 6-digit code">
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={[styles.cell, i === code.length && styles.cellActive]}>
            <Text style={styles.digit}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, LENGTH);
          setCode(digits);
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
      {error ? (
        <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>
      ) : (
        <Text variant="small" muted>Preview build: any 6 digits will continue.</Text>
      )}

      <View style={{ marginTop: 'auto', gap: space.sm }}>
        <Button title="Verify" loading={busy} disabled={code.length !== LENGTH} onPress={() => void submit()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.flareSoft, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  cells: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  cell: { flex: 1, height: 58, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cellActive: { borderColor: colors.flare, borderWidth: 2 },
  digit: { fontFamily: fonts.extrabold, fontSize: 24 },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
