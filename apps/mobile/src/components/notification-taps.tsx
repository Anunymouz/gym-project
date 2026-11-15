import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { targetOf } from '@/lib/push';

/** Opens the screen a tapped notification points to (also when the tap launched the app). */
export function NotificationTaps() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const target = targetOf(response ?? null);
    if (!target) return;
    void Notifications.clearLastNotificationResponseAsync();
    router.push(target as Href);
  }, [response]);
  return null;
}
