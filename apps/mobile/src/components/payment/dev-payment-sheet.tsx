import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { formatGhs, pesewas } from '@bgym/shared';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { colors, radii, space } from '@/theme';

/**
 * Development builds only (PAYMENTS_DRIVER=dev): stands in for the MoMo approval prompt so the
 * full flow can be tested without real money. Never shown with live Paystack payments.
 */
export function DevPaymentSheet({ checkout, email, onApprove, onCancel }: { checkout: { amountPesewas: number } | null; email: string; onApprove: () => void; onCancel: () => void }) {
  return (
    <Modal visible={!!checkout} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Cancel payment" />
      {checkout && (
        <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.devTag}><Text variant="label" style={{ color: colors.violet }}>Development payment</Text></View>
          <Text variant="title">Approve {formatGhs(pesewas(checkout.amountPesewas))}?</Text>
          <Text muted>In the live app, Paystack sends a Mobile Money prompt to your phone here. This test payment uses no real money ({email}).</Text>
          <Button title="Approve payment" onPress={onApprove} />
          <Button title="Cancel" variant="secondary" onPress={onCancel} />
        </Animated.View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,10,26,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.xl, paddingBottom: 40, gap: space.md },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.xs },
  devTag: { alignSelf: 'flex-start', backgroundColor: colors.violetSoft, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
});
