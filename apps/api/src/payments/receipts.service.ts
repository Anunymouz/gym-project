import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatGhs, paymentChannelLabel, pesewas, receiptNumber, type Receipt, type ReceiptSummary } from '@bgym/shared';
import { MailService } from '../mail/mail.service.js';
import { receiptEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

const select = {
  id: true, reference: true, paidAt: true, amountPesewas: true, channel: true,
  user: { select: { name: true, email: true } },
  membership: { select: { startsAt: true, endsAt: true, plan: { select: { name: true } }, gym: { select: { name: true, addressText: true, phone: true } } } },
  booking: { select: { startsAt: true, endsAt: true, trainer: { select: { user: { select: { name: true } }, gym: { select: { name: true, addressText: true, phone: true } } } } } },
  orders: { orderBy: { number: 'asc' }, select: { number: true, seller: { select: { name: true } } } },
  packagePurchase: { select: { startsAt: true, endsAt: true, sessionsCount: true, trainerPackage: { select: { name: true } }, trainer: { select: { user: { select: { name: true } }, gym: { select: { name: true, addressText: true, phone: true } } } } } },
} as const;

type Gym = { name: string; addressText: string; phone: string | null };

/** Receipts for successful payments: emailed once, and listed in the app. */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async list(userId: string): Promise<ReceiptSummary[]> {
    const rows = await this.prisma.payment.findMany({ where: { userId, status: 'success' }, orderBy: { paidAt: 'desc' }, take: 100, select });
    return rows.map((r) => this.toReceipt(r));
  }

  /** Only the payer can see their receipt (anyone else gets "not found"). */
  async get(userId: string, paymentId: string): Promise<Receipt> {
    const row = await this.prisma.payment.findFirst({ where: { id: paymentId, userId, status: 'success' }, select });
    if (!row) throw new NotFoundException('Receipt not found');
    return this.toReceipt(row);
  }

  /** Called once, right after a payment is confirmed. A failed email never undoes the payment. */
  async send(paymentId: string): Promise<void> {
    try {
      const row = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select });
      const r = this.toReceipt(row);
      await this.mail.send(
        receiptEmail({
          to: r.member.email,
          number: r.number,
          memberName: r.member.name,
          title: r.title,
          gymName: r.gym?.name ?? 'BGYM',
          amount: formatGhs(pesewas(r.amountPesewas)),
          paidAt: new Date(r.paidAt),
          channel: paymentChannelLabel(r.channel),
          period: r.period ? { startsAt: new Date(r.period.startsAt), endsAt: new Date(r.period.endsAt) } : null,
        }),
      );
    } catch (err) {
      this.logger.error(`Receipt email for payment ${paymentId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private toReceipt(r: {
    id: string; reference: string; paidAt: Date | null; amountPesewas: number; channel: string | null;
    user: { name: string | null; email: string };
    membership: { startsAt: Date; endsAt: Date; plan: { name: string }; gym: Gym } | null;
    booking: { startsAt: Date; endsAt: Date; trainer: { user: { name: string | null }; gym: Gym } } | null;
    packagePurchase: { startsAt: Date; endsAt: Date; sessionsCount: number; trainerPackage: { name: string }; trainer: { user: { name: string | null }; gym: Gym } } | null;
    orders: Array<{ number: string; seller: { name: string } }>;
  }): Receipt {
    const m = r.membership;
    const b = r.booking;
    const p = r.packagePurchase;
    const what = m
      ? { title: `${m.plan.name} · ${m.gym.name}`, gym: m.gym, plan: m.plan.name, period: { startsAt: m.startsAt, endsAt: m.endsAt } }
      : b
        ? { title: `Personal training · ${b.trainer.user.name ?? 'Trainer'}`, gym: b.trainer.gym, plan: 'Training session', period: { startsAt: b.startsAt, endsAt: b.endsAt } }
        : p
          ? { title: `${p.trainerPackage.name} · ${p.trainer.user.name ?? 'Trainer'}`, gym: p.trainer.gym, plan: `${p.sessionsCount} training sessions`, period: { startsAt: p.startsAt, endsAt: p.endsAt } }
          : r.orders.length
            ? { title: `BGYM Store · ${r.orders.map((o) => o.number).join(', ')}`, gym: null, plan: `Order${r.orders.length > 1 ? 's' : ''} ${r.orders.map((o) => o.number).join(', ')}`, period: null }
            : null;
    return {
      id: r.id,
      number: receiptNumber(r.reference),
      reference: r.reference,
      paidAt: (r.paidAt ?? new Date(0)).toISOString(),
      amountPesewas: r.amountPesewas,
      channel: r.channel,
      title: what?.title ?? 'Payment',
      member: r.user,
      gym: what?.gym ?? null,
      plan: what?.plan ?? null,
      period: what?.period ? { startsAt: what.period.startsAt.toISOString(), endsAt: what.period.endsAt.toISOString() } : null,
    };
  }
}
