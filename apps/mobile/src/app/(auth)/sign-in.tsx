import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { emailSchema } from '@bgym/shared';
import { Mark } from '@/components/brand/mark';
import { AppleMark, GoogleMark } from '@/components/brand/social-marks';
import { EnvelopeSimpleIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

export default function SignIn() {
  const { startEmailSignIn } = useSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const comingSoon = (provider: string) =>
    Alert.alert(`${provider} sign-in`, `${provider} sign-in is connected in Phase 1. Use email for this preview.`);

  function continueWithEmail() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
    setError(null);
    startEmailSignIn(parsed.data);
    router.push('/verify');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['top', 'bottom']} style={styles.content}>
        <View style={styles.header}>
          <Mark width={112} />
          <Text variant="title" style={styles.center}>Welcome to BGYM</Text>
          <Text muted style={styles.center}>Sign in or create your account</Text>
        </View>

        <Button title="Continue with Apple" variant="black" icon={<AppleMark size={18} />} onPress={() => comingSoon('Apple')} />
        <Button title="Continue with Google" variant="secondary" icon={<GoogleMark size={19} />} onPress={() => comingSoon('Google')} />

        <View style={styles.divider} accessibilityElementsHidden>
          <View style={styles.rule} />
          <Text variant="small" muted>or</Text>
          <View style={styles.rule} />
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="smallBold" nativeID="email-label">Email</Text>
          <View style={[styles.field, error && { borderColor: colors.danger }]}>
            <EnvelopeSimpleIcon size={20} color={colors.textMuted} />
            <TextInput
              accessibilityLabelledBy="email-label"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={continueWithEmail}
              placeholder="you@example.com"
              placeholderTextColor="#9AA0B4"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              style={styles.input}
            />
          </View>
          {error && <Text variant="smallBold" style={{ color: colors.danger }} accessibilityLiveRegion="polite">{error}</Text>}
        </View>
        <Button title="Continue with email" onPress={continueWithEmail} />

        <Text variant="small" muted style={[styles.center, { marginTop: 'auto' }]}>
          By continuing you agree to the Terms and Privacy Policy.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: space.md, paddingTop: space.xl },
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.md },
  center: { textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.xs },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  field: { height: 52, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, height: '100%', fontFamily: fonts.medium, fontSize: 16, color: colors.text },
});
