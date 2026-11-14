import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Mark } from '@/components/brand/mark';
import { Wordmark } from '@/components/brand/wordmark';
import { IconButton } from '@/components/header';
import { BellIcon, ShoppingBagIcon, UsersThreeIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

export default function Home() {
  return (
    <Screen scroll>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Mark width={44} />
          <Wordmark height={22} />
        </View>
        <IconButton label="Notifications"><BellIcon size={21} color={colors.text} /></IconButton>
        <IconButton label="BGYM Store" onPress={() => router.push('/store')}><ShoppingBagIcon size={21} color={colors.text} /></IconButton>
      </View>

      <EmptyState
        icon={<UsersThreeIcon size={28} color={colors.flare} weight="duotone" />}
        title="Your feed starts here"
        body="Join a gym to see its workouts, videos and news in your feed."
        action={<View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button title="Find a gym near you" onPress={() => router.navigate('/gyms')} /></View>}
      />

      <Pressable accessibilityRole="button" onPress={() => router.push('/store')} style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ color: colors.ember }}>BGYM Store</Text>
          <Text variant="heading" style={{ color: colors.white }}>Fuel your training</Text>
          <Text variant="small" style={{ color: colors.onDarkMuted }}>Protein, creatine, apparel and gear, delivered in Accra.</Text>
        </View>
        <View style={styles.shop}><Text variant="smallBold">Shop</Text></View>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.sm },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.midnight, borderRadius: radii.lg, padding: space.lg },
  shop: { backgroundColor: colors.flare, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8 },
});
