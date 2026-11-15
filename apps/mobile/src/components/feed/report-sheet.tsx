import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REPORT_REASONS, type ReportReason } from '@bgym/shared';
import { CheckCircleIcon, FlagIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ApiError, feedApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

/** Bottom sheet to report a post to the BGYM team. */
export function ReportSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason(null);
    setState('idle');
    setError(null);
    onClose();
  };
  const send = async () => {
    if (!postId || !reason) return;
    setState('sending');
    try {
      await feedApi.report(postId, { reason });
      setState('done');
    } catch (e) {
      // Already reported counts as done for the person reporting.
      if (e instanceof ApiError && e.status === 409) return setState('done');
      setError(e instanceof Error ? e.message : 'Couldn’t send. Try again.');
      setState('idle');
    }
  };

  return (
    <Modal visible={postId !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        {state === 'done' ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <CheckCircleIcon size={40} color={colors.success} weight="fill" />
            <Text variant="heading">Thanks for telling us</Text>
            <Text muted style={{ textAlign: 'center' }}>The BGYM team will review this post.</Text>
            <View style={{ alignSelf: 'stretch', marginTop: space.sm }}><Button title="Done" variant="dark" onPress={close} /></View>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <FlagIcon size={22} color={colors.danger} weight="fill" />
              <Text variant="heading">Report post</Text>
            </View>
            <Text muted>Why are you reporting it? The gym won’t see who reported it.</Text>
            <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
              {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
                <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} onPress={() => setReason(r)} style={[styles.option, reason === r && styles.optionOn]}>
                  <Text variant="bodyBold" style={reason === r ? { color: colors.white } : undefined}>{REPORT_REASONS[r]}</Text>
                </Pressable>
              ))}
            </View>
            {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
            <Button title="Send report" disabled={!reason} loading={state === 'sending'} onPress={() => void send()} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,10,26,0.5)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.xl },
  option: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingVertical: 14, paddingHorizontal: space.lg },
  optionOn: { backgroundColor: colors.midnight, borderColor: colors.midnight },
});
