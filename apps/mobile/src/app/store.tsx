import { Pressable, StyleSheet, View } from 'react-native';
import { Header, IconButton } from '@/components/header';
import { MagnifyingGlassIcon, ShoppingBagIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, fonts, radii, space } from '@/theme';

const categories = ['All', 'Supplements', 'Apparel', 'Equipment', 'Accessories'];

export default function Store() {
  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="BGYM Store" right={<IconButton label="Cart"><ShoppingBagIcon size={21} color={colors.text} /></IconButton>} />
      <View style={styles.search}>
        <MagnifyingGlassIcon size={19} color="#9AA0B4" />
        <Text muted>Search protein, creatine, dumbbells…</Text>
      </View>
      <View style={styles.chips}>
        {categories.map((c, i) => (
          <Pressable key={c} accessibilityRole="button" style={[styles.chip, i === 0 && styles.chipOn]}>
            <Text style={[styles.chipText, i === 0 && { color: colors.white }]}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <EmptyState
        icon={<ShoppingBagIcon size={28} color={colors.flare} weight="duotone" />}
        title="The store opens in Phase 3"
        body="Shop supplements, apparel and equipment without joining a gym. Pay with MoMo or card; we deliver across Accra."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { height: 46, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
});
