import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircleIcon, ShieldCheckIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { communityApi } from '@/lib/api';
import { colors, radii, space } from '@/theme';

export const COMMUNITY_RULES = [
  'Be kind. No bullying, harassment, hate or threats.',
  'Keep it about training and your gym. No spam, scams or selling.',
  'Only post photos and videos you took or have permission to share. Ask before filming other people.',
  'No nudity, sexual content or graphic violence.',
  'No dangerous advice, steroids or other drugs.',
];

/** Shown once, before someone's first post, story or comment. */
export function CommunityRules({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    try {
      await communityApi.acceptRules();
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <View style={styles.badge}><ShieldCheckIcon size={30} color={colors.violet} weight="duotone" /></View>
      <Text variant="title">Our community rules</Text>
      <Text muted>Your posts are seen by the members of your gym. Keep BGYM a place everyone wants to train.</Text>
      <View style={{ gap: space.md, marginTop: space.sm }}>
        {COMMUNITY_RULES.map((r) => (
          <View key={r} style={styles.rule}>
            <CheckCircleIcon size={20} color={colors.success} weight="fill" />
            <Text style={{ flex: 1 }}>{r}</Text>
          </View>
        ))}
      </View>
      <Text variant="small" muted style={{ marginTop: space.sm }}>Posts that break these rules are removed, and people who keep breaking them lose access. Anyone can report a post, and you can block people.</Text>
      {error && <Text variant="smallBold" style={{ color: colors.danger }}>{error}</Text>}
      <Button title="I agree" loading={busy} onPress={() => void accept()} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl, gap: space.md },
  badge: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.violetSoft, alignItems: 'center', justifyContent: 'center' },
  rule: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
});
