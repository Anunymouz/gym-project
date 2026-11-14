import { StyleSheet, View } from 'react-native';
import { Header } from '@/components/header';
import { LockSimpleIcon, PersonSimpleRunIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

export default function Workouts() {
  return (
    <Screen scroll tabs>
      <Header title="Workouts" />
      <EmptyState
        icon={<PersonSimpleRunIcon size={28} color={colors.flare} weight="duotone" />}
        title="Guided home workouts"
        body="Animated exercises you can follow anywhere. A few basics are free; joining any gym on BGYM unlocks the full library."
      />
      <View style={styles.note}>
        <LockSimpleIcon size={20} color={colors.flare} weight="bold" />
        <Text variant="small" style={{ flex: 1 }}>The workout library launches in Phase 4 of the roadmap.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.flareSoft, borderRadius: radii.md, padding: space.md },
});
