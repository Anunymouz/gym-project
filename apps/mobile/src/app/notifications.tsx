import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Switch, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { NOTIFICATION_TOPICS, topicChannels, type NotificationChannel, type NotificationSettings, type NotificationTopic } from '@bgym/shared';
import { Header } from '@/components/header';
import { BellIcon, CheckCircleIcon, DeviceMobileIcon, EnvelopeSimpleIcon, InfoIcon } from '@/components/icons';
import { Skeleton } from '@/components/motion/skeleton';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { notificationsApi } from '@/lib/api';
import { enablePush, openSystemSettings, pushStatus, type PushStatus } from '@/lib/push';
import { colors, radii, space } from '@/theme';

/** react-native-web colours the "on" knob with its own prop (dev preview only). */
const webSwitchColors = { activeThumbColor: colors.white } as object;

const topics = Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[];
const channelMeta: Record<NotificationChannel, { label: string; Icon: typeof BellIcon }> = {
  push: { label: 'On this phone', Icon: DeviceMobileIcon },
  email: { label: 'By email', Icon: EnvelopeSimpleIcon },
};

export default function NotificationsScreen() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState<PushStatus | null>(null);
  const [turningOn, setTurningOn] = useState(false);

  const refreshPhone = useCallback(() => {
    void pushStatus().then(setPhone);
  }, []);

  useEffect(() => {
    notificationsApi.settings().then(setSettings, (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'));
    refreshPhone();
    // Coming back from the phone's Settings app: pick up a newly allowed permission.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void enablePush({ ask: false }).then(setPhone);
    });
    return () => sub.remove();
  }, [refreshPhone]);

  const turnOn = async () => {
    setTurningOn(true);
    setPhone(await enablePush({ ask: true }));
    setTurningOn(false);
  };

  const toggle = async (topic: NotificationTopic, channel: NotificationChannel, enabled: boolean) => {
    if (!settings) return;
    void Haptics.selectionAsync();
    const before = settings;
    setSettings({ ...settings, [topic]: { ...settings[topic], [channel]: enabled } }); // optimistic
    try {
      setSettings(await notificationsApi.update({ topic, channel, enabled }));
      setError(null);
    } catch (e) {
      setSettings(before);
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.');
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header back title="Notifications" />

      {phone && <PhoneCard status={phone} busy={turningOn} onTurnOn={turnOn} />}

      {error && <Text variant="smallBold" style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text>}

      {!settings && !error && [0, 1, 2].map((i) => <Skeleton key={i} height={120} radius={18} />)}

      {settings &&
        topics.map((topic, i) => (
          <Animated.View key={topic} entering={FadeInDown.delay(i * 60).duration(320)} style={styles.card}>
            <Text variant="bodyBold">{NOTIFICATION_TOPICS[topic].label}</Text>
            <Text variant="small" muted style={{ marginTop: 2 }}>{NOTIFICATION_TOPICS[topic].description}</Text>
            <View style={styles.channels}>
              {topicChannels(topic).map((channel) => {
                const { label, Icon } = channelMeta[channel];
                const value = settings[topic][channel] ?? false;
                return (
                  <View key={channel} style={styles.channel}>
                    <Icon size={19} color={colors.textMuted} />
                    <Text variant="body" style={{ flex: 1 }}>{label}</Text>
                    <Switch
                      value={value}
                      onValueChange={(v) => void toggle(topic, channel, v)}
                      accessibilityLabel={`${NOTIFICATION_TOPICS[topic].label} ${label.toLowerCase()}`}
                      trackColor={{ false: '#D9DCEA', true: colors.flare }}
                      thumbColor={colors.white}
                      ios_backgroundColor="#D9DCEA"
                      {...webSwitchColors}
                    />
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ))}

      {settings && (
        <Text variant="small" muted style={{ textAlign: 'center' }}>
          Sign-in codes and payment receipts are always emailed.
        </Text>
      )}
    </Screen>
  );
}

function PhoneCard({ status, busy, onTurnOn }: { status: PushStatus; busy: boolean; onTurnOn: () => void }) {
  if (status.state === 'on') {
    return (
      <Animated.View entering={FadeIn} style={[styles.banner, { backgroundColor: colors.successSoft }]}>
        <CheckCircleIcon size={22} color={colors.success} weight="fill" />
        <Text variant="smallBold" style={{ flex: 1, color: colors.success }}>Notifications are on for this phone</Text>
      </Animated.View>
    );
  }
  if (status.state === 'unavailable') {
    return (
      <Animated.View entering={FadeIn} style={[styles.banner, { backgroundColor: colors.violetSoft }]}>
        <InfoIcon size={22} color={colors.violet} weight="fill" />
        <Text variant="small" style={{ flex: 1, color: colors.violet }}>{status.reason}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeIn} style={styles.cta}>
      <View style={styles.ctaIcon}>
        <BellIcon size={26} color={colors.flare} weight="duotone" />
      </View>
      <Text variant="heading" style={{ textAlign: 'center' }}>Don’t miss a renewal</Text>
      <Text variant="small" muted style={{ textAlign: 'center' }}>
        {status.canAsk
          ? 'Get a reminder on this phone before your membership ends, and a heads-up when you’re checked in.'
          : 'Notifications are turned off for BGYM in your phone’s settings. Turn them on there to get reminders.'}
      </Text>
      <View style={{ alignSelf: 'stretch', marginTop: space.sm }}>
        {status.canAsk ? (
          <Button title="Turn on notifications" loading={busy} onPress={onTurnOn} />
        ) : (
          <Button title="Open Settings" variant="dark" onPress={() => void openSystemSettings()} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  channels: { marginTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  channel: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radii.lg, padding: space.md },
  cta: { alignItems: 'center', gap: space.xs, backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: space.xl },
  ctaIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.flareSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
