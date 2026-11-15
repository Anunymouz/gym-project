import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANDROID_CHANNELS, formatGhs, pesewas } from '@bgym/shared';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { newOrderEmail, orderUpdateEmail, orderUpdateMessage } from '../mail/templates.js';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { PushService } from '../notifications/push.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Tells sellers about new orders and members about their order's progress (best effort). */
@Injectable()
export class OrderNotifier {
  private readonly logger = new Logger(OrderNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly push: PushService,
    private readonly settings: NotificationSettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async newOrder(orderId: string): Promise<void> {
    try {
      const o = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { number: true, userId: true, totalPesewas: true, items: { select: { titleSnapshot: true, quantity: true } }, seller: { select: { type: true, name: true, contactEmail: true, users: { select: { user: { select: { email: true } } } } } } },
      });
      const web = this.config.get('WEB_URL', { infer: true });
      // Partners' people get it; BGYM's own orders go to the BGYM team.
      const to = o.seller.type === 'partner' ? o.seller.users.map((u) => u.user.email) : (await this.prisma.user.findMany({ where: { roles: { has: 'admin' }, status: 'active' }, take: 10, select: { email: true } })).map((u) => u.email);
      const url = `${web}/${o.seller.type === 'partner' ? 'partner' : 'admin/store/orders'}`;
      const items = o.items.map((i) => `${i.quantity} × ${i.titleSnapshot}`);
      await Promise.allSettled(to.map((email) => this.mail.send(newOrderEmail(email, o.seller.name, o.number, items, formatGhs(pesewas(o.totalPesewas)), url))));
      await this.member(orderId, 'paid');
    } catch (err) {
      this.logger.warn(`New-order notice failed: ${String(err)}`);
    }
  }

  /** Push (and, for the big moments, email) to the member, if they allow store-order notices. */
  async member(orderId: string, status: string): Promise<void> {
    try {
      const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { number: true, userId: true, user: { select: { email: true } }, delivery: { select: { courierName: true, courierPhone: true } } } });
      const message = orderUpdateMessage(o.number, status, o.delivery ? { name: o.delivery.courierName, phone: o.delivery.courierPhone } : undefined);
      const [push, email] = await Promise.all([this.settings.allowing([o.userId], 'orders', 'push'), this.settings.allowing([o.userId], 'orders', 'email')]);
      if (push.has(o.userId)) await this.push.send([o.userId], { ...message, channelId: ANDROID_CHANNELS.orders, data: { url: `/orders/${orderId}` } });
      if (email.has(o.userId) && ['out_for_delivery', 'delivered', 'cancelled', 'delivery_failed'].includes(status)) await this.mail.send(orderUpdateEmail(o.user.email, o.number, status, message.body));
    } catch (err) {
      this.logger.warn(`Order notice failed: ${String(err)}`);
    }
  }
}
