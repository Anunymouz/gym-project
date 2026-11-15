import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { RegisterDeviceInput } from '@bgym/shared';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PushMessage {
  title: string;
  body: string;
  /** Opened by the app when the notification is tapped, e.g. { url: '/memberships' }. */
  data?: Record<string, string>;
  /** Android notification channel created by the app. */
  channelId?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts';
const SEND_CHUNK = 100; // Expo's limit per request
const RECEIPT_CHUNK = 300;
const MINUTE = 60_000;

/**
 * Push notifications through Expo's push service (which talks to APNs and FCM).
 * Delivery is best effort: a failed push never fails the action that caused it.
 * Tokens Expo reports as dead (app uninstalled) are removed, from the immediate response
 * and from the receipts checked later.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  /** Messages per user, for the memory driver (tests). */
  readonly outbox: Array<{ userId: string; token: string; message: PushMessage }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(userId: string, input: RegisterDeviceInput): Promise<void> {
    // A token identifies an install: whoever signed in on it last receives its pushes.
    await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform, lastSeenAt: new Date() },
    });
  }

  /** Only removes the token if it belongs to the caller. */
  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
  }

  async hasDevice(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.prisma.deviceToken.findMany({ where: { userId: { in: userIds } }, distinct: ['userId'], select: { userId: true } });
    return new Set(rows.map((r) => r.userId));
  }

  /** Sends to every device of these users. Returns how many devices accepted it. */
  async send(userIds: string[], message: PushMessage): Promise<number> {
    if (userIds.length === 0) return 0;
    const devices = await this.prisma.deviceToken.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, token: true } });
    if (devices.length === 0) return 0;

    const driver = this.config.get('PUSH_DRIVER', { infer: true });
    if (driver !== 'expo') {
      for (const d of devices) {
        if (driver === 'memory') this.outbox.push({ userId: d.userId, token: d.token, message });
        else this.logger.warn(`[development push] to=${d.userId} "${message.title}": ${message.body}`);
      }
      return devices.length;
    }

    let accepted = 0;
    for (let i = 0; i < devices.length; i += SEND_CHUNK) {
      const chunk = devices.slice(i, i + SEND_CHUNK);
      try {
        const tickets = await this.post<ExpoTicket[]>(
          EXPO_SEND,
          chunk.map((d) => ({ to: d.token, title: message.title, body: message.body, data: message.data, channelId: message.channelId, sound: 'default', priority: 'high' })),
        );
        accepted += await this.handleTickets(chunk, tickets);
      } catch (err) {
        this.logger.error(`Push delivery failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return accepted;
  }

  private async handleTickets(devices: Array<{ id: string }>, tickets: ExpoTicket[]): Promise<number> {
    const dead: string[] = [];
    const ok: Array<{ ticketId: string; deviceTokenId: string }> = [];
    tickets.forEach((t, i) => {
      const device = devices[i];
      if (!device) return;
      if (t.status === 'ok' && t.id) ok.push({ ticketId: t.id, deviceTokenId: device.id });
      else if (t.details?.error === 'DeviceNotRegistered') dead.push(device.id);
      else this.logger.warn(`Push rejected: ${t.details?.error ?? t.message ?? 'unknown'}`);
    });
    if (dead.length) await this.prisma.deviceToken.deleteMany({ where: { id: { in: dead } } });
    if (ok.length) await this.prisma.pushTicket.createMany({ data: ok, skipDuplicates: true });
    return ok.length;
  }

  /** Expo's receipts are ready after ~15 minutes; they reveal tokens that stopped working. */
  @Cron('0 */20 * * * *', { name: 'push-receipts', waitForCompletion: true })
  async checkReceipts(now = new Date()): Promise<void> {
    if (this.config.get('PUSH_DRIVER', { infer: true }) !== 'expo') return;
    // Tickets older than a day can no longer be looked up.
    await this.prisma.pushTicket.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * MINUTE) } } });
    const due = await this.prisma.pushTicket.findMany({ where: { createdAt: { lt: new Date(now.getTime() - 15 * MINUTE) } }, take: 3000, select: { id: true, ticketId: true, deviceTokenId: true } });
    for (let i = 0; i < due.length; i += RECEIPT_CHUNK) {
      const chunk = due.slice(i, i + RECEIPT_CHUNK);
      try {
        const res = await this.post<Record<string, ExpoTicket>>(EXPO_RECEIPTS, { ids: chunk.map((t) => t.ticketId) });
        const dead = chunk.filter((t) => res[t.ticketId]?.details?.error === 'DeviceNotRegistered').map((t) => t.deviceTokenId);
        if (dead.length) await this.prisma.deviceToken.deleteMany({ where: { id: { in: dead } } });
        await this.prisma.pushTicket.deleteMany({ where: { id: { in: chunk.map((t) => t.id) } } });
      } catch (err) {
        this.logger.error(`Push receipts check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const token = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Expo responded ${res.status}`);
      return ((await res.json()) as { data: T }).data;
    } finally {
      clearTimeout(timer);
    }
  }
}
