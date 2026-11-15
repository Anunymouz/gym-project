import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TOPICS, topicChannels, type NotificationChannel, type NotificationSettings, type NotificationTopic, type UpdateNotificationSetting } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** Members' notification choices. A missing row means the topic's default. */
@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<NotificationSettings> {
    const rows = await this.prisma.notificationSetting.findMany({ where: { userId }, select: { topic: true, channel: true, enabled: true } });
    const saved = new Map(rows.map((r) => [`${r.topic}:${r.channel}`, r.enabled]));
    const settings = {} as NotificationSettings;
    for (const topic of Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[]) {
      const defaults: Partial<Record<NotificationChannel, boolean>> = NOTIFICATION_TOPICS[topic].defaults;
      settings[topic] = Object.fromEntries(topicChannels(topic).map((c) => [c, saved.get(`${topic}:${c}`) ?? defaults[c] ?? false]));
    }
    return settings;
  }

  async set(userId: string, change: UpdateNotificationSetting): Promise<NotificationSettings> {
    const { topic, channel, enabled } = change;
    await this.prisma.notificationSetting.upsert({
      where: { userId_topic_channel: { userId, topic, channel } },
      create: { userId, topic, channel, enabled },
      update: { enabled },
    });
    return this.get(userId);
  }

  /** Which of these people want `topic` on `channel`. */
  async allowing(userIds: string[], topic: NotificationTopic, channel: NotificationChannel): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const fallback: boolean = (NOTIFICATION_TOPICS[topic].defaults as Partial<Record<NotificationChannel, boolean>>)[channel] ?? false;
    const rows = await this.prisma.notificationSetting.findMany({ where: { userId: { in: userIds }, topic, channel }, select: { userId: true, enabled: true } });
    const saved = new Map(rows.map((r) => [r.userId, r.enabled]));
    return new Set(userIds.filter((id) => saved.get(id) ?? fallback));
  }
}
