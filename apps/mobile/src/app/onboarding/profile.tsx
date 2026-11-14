import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import Animated, { FadeInDown, ZoomIn, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { IconProps } from 'phosphor-react-native';
import type { ComponentType } from 'react';
import { FITNESS_GOALS, updateProfileSchema } from '@bgym/shared';
import { BarbellIcon, DeviceMobileIcon, FlameIcon, HeartbeatIcon, LightningIcon, PersonSimpleRunIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { homeFor } from '@/lib/routes';
import { useSession } from '@/lib/session';
import { colors, fonts, radii, space } from '@/theme';

const goalIcons: Record<string, ComponentType<IconProps>> = {
  build_strength: BarbellIcon,
  lose_weight: FlameIcon,
  get_fit: HeartbeatIcon,
  build_muscle: LightningIcon,
  stay_active: PersonSimpleRunIcon,
};

export default function ProfileStep() {
  const { status, user, saveProfile } = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [goal, setGoal] = useState<string | null>(user?.goal ?? null);
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  if (status !== 'needsProfile') return <Redirect href={homeFor(status)} />;

  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

  async function save() {
    const parsed = updateProfileSchema.safeParse({ name, goal, phone: phone.trim() });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'phone' ? 'phone' : issue.path[0] === 'name' ? 'name' : 'form';
        next[key] ??= issue.message;
      }
      return setErrors(next);
    }
    setErrors({});
    setSaving(true);
    try {
      await saveProfile(parsed.data);
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : 'Something went wrong' });
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['top', 'bottom']} style={{ flexGrow: 1, gap: space.lg }}>
        <Animated.View entering={FadeInDown.duration(450)} style={styles.head}>
          <View style={styles.avatar}>
            {initials ? (
              <Animated.Text key={initials} entering={ZoomIn.springify().damping(14)} style={styles.initials}>
                {initials}
              </Animated.Text>
            ) : (
              <PersonSimpleRunIcon size={34} color={colors.violet} weight="duotone" />
            )}
          </View>
          <Text variant="title">Set up your profile</Text>
          <Text muted>So your gyms and trainers know who you are.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={{ gap: space.sm }}>
          <Text variant="smallBold" nativeID="name-label">Your name</Text>
          <TextInput
            accessibilityLabelledBy="name-label"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ama Owusu"
            placeholderTextColor="#9AA0B4"
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            maxLength={60}
            style={[styles.input, errors.name && styles.inputError]}
          />
          {errors.name && <Text variant="smallBold" style={styles.error}>{errors.name}</Text>}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(450)} style={{ gap: space.sm }}>
          <Text variant="smallBold">Your main goal</Text>
          <View style={styles.goals} accessibilityRole="radiogroup">
            {FITNESS_GOALS.map((g) => (
              <GoalChip key={g.id} label={g.label} Icon={goalIcons[g.id] ?? BarbellIcon} selected={goal === g.id} onPress={() => setGoal(goal === g.id ? null : g.id)} />
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(450)} style={{ gap: space.sm }}>
          <Text variant="smallBold" nativeID="phone-label">Mobile Money number <Text variant="small" muted>(optional)</Text></Text>
          <View style={[styles.phoneRow, errors.phone && styles.inputError]}>
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
              style={styles.phoneInput}
            />
          </View>
          {errors.phone ? (
            <Text variant="smallBold" style={styles.error}>{errors.phone}</Text>
          ) : (
            <Text variant="small" muted>Makes MoMo checkout and store delivery faster. Never shown to gyms.</Text>
          )}
        </Animated.View>

        <View style={{ marginTop: 'auto', gap: space.sm }}>
          {errors.form && <Text variant="smallBold" style={styles.error}>{errors.form}</Text>}
          <Button title="Continue" loading={saving} onPress={() => void save()} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function GoalChip({ label, Icon, selected, onPress }: { label: string; Icon: ComponentType<IconProps>; selected: boolean; onPress: () => void }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1.04 : 1, { damping: 14 }) }] }));
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}>
      <Animated.View style={[styles.goal, selected && styles.goalOn, style]}>
        <Icon size={20} color={selected ? colors.white : colors.flare} weight={selected ? 'fill' : 'duotone'} />
        <Text variant="smallBold" style={{ color: selected ? colors.white : colors.text }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm, marginTop: space.md },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  initials: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.violet },
  input: { height: 52, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 14, fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  goalOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  phoneRow: { height: 52, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  phoneInput: { flex: 1, height: '100%', fontFamily: fonts.medium, fontSize: 16, color: colors.text },
});
