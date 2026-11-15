import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addressSchema } from '@bgym/shared';
import { Header } from '@/components/header';
import { describe, LocationPicker, type Point } from '@/components/store/location-picker';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { storeApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

const LABELS = ['Home', 'Work', 'Gym', 'Other'];

/** Add or edit a delivery address: pin on the map, words for the rider, phone number. */
export default function AddressScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [point, setPoint] = useState<Point | null>(null);
  const [form, setForm] = useState({ label: 'Home', addressText: '', landmark: '', gpsDigitalAddress: '', contactPhone: user?.phone ?? '' });
  const [touchedText, setTouchedText] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    storeApi.addresses().then((list) => {
      const a = list.find((x) => x.id === id);
      if (!a) return;
      setPoint({ latitude: a.latitude, longitude: a.longitude });
      setForm({ label: a.label ?? 'Other', addressText: a.addressText, landmark: a.landmark ?? '', gpsDigitalAddress: a.gpsDigitalAddress ?? '', contactPhone: a.contactPhone });
      setTouchedText(true);
    }, () => undefined);
  }, [id]);

  // Suggest words for the pin until the member types their own.
  useEffect(() => {
    if (!point || touchedText) return;
    const t = setTimeout(() => void describe(point).then((d) => d && setForm((f) => (touchedText ? f : { ...f, addressText: d }))), 500);
    return () => clearTimeout(t);
  }, [point, touchedText]);

  const save = async () => {
    setError(null);
    if (!point) return setError('Set the pin on your delivery spot first.');
    const parsed = addressSchema.safeParse({ ...form, ...point });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
      setErrors(out);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (id) await storeApi.updateAddress(id, parsed.data);
      else await storeApi.addAddress(parsed.data);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 4 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: space.lg }}><Header back title={id ? 'Edit address' : 'Delivery address'} /></View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }} keyboardShouldPersistTaps="handled">
        <LocationPicker value={point} onChange={setPoint} />
        <View style={styles.labels}>
          {LABELS.map((l) => (
            <Pressable key={l} accessibilityRole="radio" accessibilityState={{ checked: form.label === l }} onPress={() => setForm({ ...form, label: l })} style={[styles.chip, form.label === l && styles.chipOn]}>
              <Text variant="smallBold" style={form.label === l ? { color: colors.white } : undefined}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Address and directions" error={errors.addressText}>
          <TextInput value={form.addressText} onChangeText={(t) => { setTouchedText(true); setForm({ ...form, addressText: t }); }} placeholder="House 12, Lagos Avenue, East Legon" placeholderTextColor={colors.textMuted} maxLength={200} multiline style={[styles.input, { minHeight: 64 }]} accessibilityLabel="Address and directions" />
        </Field>
        <Field label="Landmark (optional)">
          <TextInput value={form.landmark} onChangeText={(t) => setForm({ ...form, landmark: t })} placeholder="Opposite the pharmacy, blue gate" placeholderTextColor={colors.textMuted} maxLength={120} style={styles.input} accessibilityLabel="Landmark" />
        </Field>
        <Field label="GhanaPost GPS (optional)" error={errors.gpsDigitalAddress}>
          <TextInput value={form.gpsDigitalAddress} onChangeText={(t) => setForm({ ...form, gpsDigitalAddress: t.toUpperCase() })} placeholder="GA-123-4567" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={14} style={styles.input} accessibilityLabel="GhanaPost GPS address" />
        </Field>
        <Field label="Phone for the rider" error={errors.contactPhone}>
          <TextInput value={form.contactPhone} onChangeText={(t) => setForm({ ...form, contactPhone: t })} placeholder="024 123 4567" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" maxLength={16} style={styles.input} accessibilityLabel="Phone for the rider" />
        </Field>
        {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
        <Button title="Save address" loading={saving} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="smallBold">{label}</Text>
      {children}
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', gap: space.sm },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  input: { backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 12, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
});
