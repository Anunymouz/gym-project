import { useRef, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { colors, fonts, radii, space } from '@/theme';

/** First and last name, side by side. "Next" on the keyboard moves from one to the other. */
export function NameFields({
  firstName,
  lastName,
  onChange,
  errors,
  onDone,
  autoFocus,
}: {
  firstName: string;
  lastName: string;
  onChange: (next: { firstName: string; lastName: string }) => void;
  errors: { firstName?: string; lastName?: string };
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const last = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <Text variant="smallBold" nativeID="first-label">First name</Text>
        <TextInput
          accessibilityLabelledBy="first-label"
          value={firstName}
          onChangeText={(v) => onChange({ firstName: v, lastName })}
          placeholder="Ama"
          placeholderTextColor="#9AA0B4"
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="next"
          onSubmitEditing={() => last.current?.focus()}
          submitBehavior="submit"
          maxLength={30}
          style={[styles.input, errors.firstName && styles.inputError]}
        />
        {errors.firstName && <Text variant="smallBold" style={styles.error}>{errors.firstName}</Text>}
      </View>
      <View style={styles.col}>
        <Text variant="smallBold" nativeID="last-label">Last name</Text>
        <TextInput
          ref={last}
          accessibilityLabelledBy="last-label"
          value={lastName}
          onChangeText={(v) => onChange({ firstName, lastName: v })}
          placeholder="Owusu"
          placeholderTextColor="#9AA0B4"
          autoComplete="family-name"
          textContentType="familyName"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onDone}
          maxLength={30}
          style={[styles.input, errors.lastName && styles.inputError]}
        />
        {errors.lastName && <Text variant="smallBold" style={styles.error}>{errors.lastName}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  col: { flex: 1, gap: space.sm },
  input: { height: 52, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 14, fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger },
});
