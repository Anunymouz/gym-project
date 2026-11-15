import { z } from 'zod';

export const NOTIFICATION_CHANNELS = ['push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * What members can hear about, which channels each topic uses, and the defaults for
 * people who haven't changed anything. Sign-in codes and payment receipts are always sent
 * and are not listed. Marketing is off until the member opts in.
 */
export const NOTIFICATION_TOPICS = {
  renewals: {
    label: 'Membership renewals',
    description: '7, 3 and 1 days before a membership ends, and when it ends.',
    defaults: { push: true, email: true },
  },
  check_ins: {
    label: 'Check-ins',
    description: 'When you’re checked in at a gym, so you know it was you.',
    defaults: { push: true },
  },
  news: {
    label: 'News and offers',
    description: 'New gyms, features and offers from BGYM. A few times a month at most.',
    defaults: { push: false, email: false },
  },
} as const satisfies Record<string, { label: string; description: string; defaults: Partial<Record<NotificationChannel, boolean>> }>;

export type NotificationTopic = keyof typeof NOTIFICATION_TOPICS;
export const notificationTopicSchema = z.enum(Object.keys(NOTIFICATION_TOPICS) as [NotificationTopic, ...NotificationTopic[]]);

export const topicChannels = (topic: NotificationTopic) => Object.keys(NOTIFICATION_TOPICS[topic].defaults) as NotificationChannel[];

/** Every topic with each of its channels on or off. */
export type NotificationSettings = { [T in NotificationTopic]: Partial<Record<NotificationChannel, boolean>> };

export const updateNotificationSettingSchema = z
  .object({ topic: notificationTopicSchema, channel: z.enum(NOTIFICATION_CHANNELS), enabled: z.boolean() })
  .refine((v) => topicChannels(v.topic).includes(v.channel), { message: 'That topic is not sent on this channel', path: ['channel'] });
export type UpdateNotificationSetting = z.infer<typeof updateNotificationSettingSchema>;

/** An Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
export const expoPushTokenSchema = z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/, 'Not an Expo push token');
export const registerDeviceSchema = z.object({ token: expoPushTokenSchema, platform: z.enum(['ios', 'android']) });
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export const unregisterDeviceSchema = z.object({ token: expoPushTokenSchema });

export const unsubscribeSchema = z.object({ token: z.string().min(20).max(1000) });
export interface UnsubscribeResponse {
  topic: NotificationTopic;
  label: string;
}

/** Android notification channels (the app creates them; the API addresses them). */
export const ANDROID_CHANNELS = { reminders: 'reminders', checkIns: 'check-ins' } as const;
