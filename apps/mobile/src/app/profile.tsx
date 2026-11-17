import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { updateProfileSchema } from '@bgym/shared';
import { Header } from '@/components/header';
import { DeviceMobileIcon, EnvelopeSimpleIcon } from '@/components/icons';
import { AvatarEditor } from '@/components/profile/avatar-editor';
import { NameFields } from '@/components/profile/name-fields';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

type Errors = { firstName?: string; lastName?: string; phone?: string; form?: string };

/** Me → your profile: photo, name (shown across BGYM) and Mobile Money number. */
export default function EditProfile() {
  const { user, saveProfile } = useSession();
  const [name, setName] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' });
  const [phone, setPhone] = useState(user?.phone ? `0${user.phone.slice(4)}` : '');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const changed = name.firstName.trim() !== (user?.firstName ?? '') || name.lastName.trim() !== (user?.lastName ?? '') || phone.trim() !== (user?.phone ? `0${user.phone.slice(4)}` : '');

  async function save() {
    const parsed = updateProfileSchema.safeParse({ ...name, phone: phone.trim() });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        next[field === 'firstName' || field === 'lastName' || field === 'phone' ? field : 'form'] ??= issue.message;
      }
      return setErrors(next);
    }
    setErrors({});
    setSaving(true);
    try {
      await saveProfile(parsed.data);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : 'Something went wrong' });
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['top', 'bottom']} style={{ flexGrow: 1, gap: space.lg }}>
        <Header back title="Your profile" />
        <Animated.View entering={FadeInDown.duration(400)} style={styles.photo}>
          <AvatarEditor size={112} firstName={name.firstName} lastName={name.lastName} onError={setPhotoError} />
          {photoError ? <Text variant="smallBold" style={styles.error}>{photoError}</Text> : <Text variant="small" muted>Tap your photo to change it</Text>}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(400)} style={{ gap: space.sm }}>
          <NameFields firstName={name.firstName} lastName={name.lastName} onChange={(n) => { setErrors((e) => ({ ...e, ...(n.firstName !== name.firstName && { firstName: undefined }), ...(n.lastName !== name.lastName && { lastName: undefined }) })); setName(n); }} errors={errors} onDone={() => void save()} />
          <Text variant="small" muted>Shown to your gyms, trainers and community.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={{ gap: space.sm }}>
          <Text variant="smallBold" nativeID="phone-label">Mobile Money number <Text variant="small" muted>(optional)</Text></Text>
          <View style={[styles.field, errors.phone && styles.fieldError]}>
            <DeviceMobileIcon size={20} color={colors.textMuted} />
            <TextInput
              accessibilityLabelledBy="phone-label"
              value={phone}
              onChangeText={setPhone}
              placeholder="024 123 4567"
              placeholderTextColor="#9AA0B4"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={16}
              style={styles.fieldInput}
            />
          </View>
          {errors.phone ? <Text variant="smallBold" style={styles.error}>{errors.phone}</Text> : <Text variant="small" muted>For MoMo checkout and store delivery. Never shown to gyms.</Text>}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(400)} style={{ gap: space.sm }}>
          <Text variant="smallBold">Email</Text>
          <View style={[styles.field, styles.readOnly]} accessible accessibilityLabel={`Email, ${user?.email}. This is how you sign in.`}>
            <EnvelopeSimpleIcon size={20} color={colors.textMuted} />
            <Text style={{ flex: 1, color: colors.textMuted }} numberOfLines={1}>{user?.email}</Text>
          </View>
          <Text variant="small" muted>You sign in with this address, so it can’t be changed here.</Text>
        </Animated.View>

        <View style={{ marginTop: 'auto', gap: space.sm }}>
          {errors.form && <Text variant="smallBold" style={styles.error}>{errors.form}</Text>}
          <Button title="Save changes" loading={saving} disabled={!changed} onPress={() => void save()} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  field: { height: 52, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  fieldError: { borderColor: colors.danger },
  fieldInput: { flex: 1, height: '100%', fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  readOnly: { backgroundColor: colors.background },
  error: { color: colors.danger },
});
