import { Linking, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { ANDROID_CHANNELS } from '@bgym/shared';
import { colors } from '@/theme';
import { notificationsApi } from './api';
import { secureStorage } from './secure-storage';

/**
 * Push notifications. The app never asks for permission out of the blue: it asks when the
 * member turns notifications on (Me → Notifications). Once allowed, the phone's push token
 * is sent to the API on each launch (tokens can change) and removed on sign-out.
 */

const TOKEN_KEY = 'bgym.pushToken';

export type PushStatus =
  | { state: 'on' }
  | { state: 'off'; canAsk: boolean } // not allowed yet; canAsk=false means only Settings can change it
  | { state: 'unavailable'; reason: string };

// Show notifications as banners even while the app is open (phones only; web is a dev preview).
if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

function unavailableReason(): string | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'Notifications work in the iOS and Android apps.';
  if (!Device.isDevice) return 'Notifications need a real phone, not a simulator.';
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Expo Go on Android can’t receive notifications. They work in the BGYM app build.';
  }
  if (!projectId()) return 'Notifications aren’t set up in this build yet (missing EAS project ID).';
  return null;
}

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.reminders, {
      name: 'Membership reminders',
      description: 'Before your membership ends',
      importance: AndroidImportance.HIGH,
      lightColor: colors.flare,
    }),
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.bookings, {
      name: 'Training sessions',
      description: 'Reminders before sessions with your trainer, and changes',
      importance: AndroidImportance.HIGH,
      lightColor: colors.flare,
    }),
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.orders, {
      name: 'Store orders',
      description: 'When your order is confirmed, on its way and delivered',
      importance: AndroidImportance.HIGH,
      lightColor: colors.flare,
    }),
    Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.checkIns, {
      name: 'Check-ins',
      description: 'When you’re checked in at a gym',
      importance: AndroidImportance.DEFAULT,
      lightColor: colors.flare,
    }),
  ]);
}

export async function pushStatus(): Promise<PushStatus> {
  const reason = unavailableReason();
  if (reason) return { state: 'unavailable', reason };
  const perm = await Notifications.getPermissionsAsync();
  return perm.granted ? { state: 'on' } : { state: 'off', canAsk: perm.canAskAgain };
}

/** Sends this phone's token to the API. Asks for permission only when `ask` is true. */
export async function enablePush({ ask }: { ask: boolean }): Promise<PushStatus> {
  const reason = unavailableReason();
  if (reason) return { state: 'unavailable', reason };
  await ensureAndroidChannels(); // Android 13+ shows the permission prompt only once a channel exists

  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return { state: 'off', canAsk: perm.canAskAgain };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId()! });
    await notificationsApi.registerDevice({ token, platform: Platform.OS as 'ios' | 'android' });
    await secureStorage.set(TOKEN_KEY, token);
    return { state: 'on' };
  } catch {
    return { state: 'unavailable', reason: 'Couldn’t connect notifications right now. Check your connection and try again.' };
  }
}

/** On sign-out, while still signed in: stop this phone getting the person's notifications. */
export async function disablePushForSignOut(): Promise<void> {
  const token = await secureStorage.get(TOKEN_KEY);
  if (!token) return;
  await secureStorage.remove(TOKEN_KEY);
  await notificationsApi.unregisterDevice(token).catch(() => undefined);
}

export const openSystemSettings = () => Linking.openSettings();

/** Where a tapped notification should take the member (only paths inside the app). */
export function targetOf(response: Notifications.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && /^\/[a-z0-9/_-]*$/i.test(url) ? url : null;
}
