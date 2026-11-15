import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { formatGhs, paymentChannelLabel, pesewas, receiptNumber, type Receipt, type ReceiptSummary } from '@bgym/shared';
import { MailService } from '../mail/mail.service.js';
import { receiptEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

const select = {
  id: true, reference: true, paidAt: true, amountPesewas: true, channel: true,
  user: { select: { name: true, email: true } },
  membership: { select: { startsAt: true, endsAt: true, plan: { select: { name: true } }, gym: { select: { name: true, addressText: true, phone: true } } } },
} as const;

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
    membership: { startsAt: Date; endsAt: Date; plan: { name: string }; gym: { name: string; addressText: string; phone: string | null } } | null;
  }): Receipt {
    const m = r.membership;
    return {
      id: r.id,
      number: receiptNumber(r.reference),
      reference: r.reference,
      paidAt: (r.paidAt ?? new Date(0)).toISOString(),
      amountPesewas: r.amountPesewas,
      channel: r.channel,
      title: m ? `${m.plan.name} · ${m.gym.name}` : 'Payment',
      member: r.user,
      gym: m?.gym ?? null,
      plan: m?.plan.name ?? null,
      period: m ? { startsAt: m.startsAt.toISOString(), endsAt: m.endsAt.toISOString() } : null,
    };
  }
}
