import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaystackClient } from './paystack.client.js';

/**
 * Full refunds of successful payments (for example a trainer session cancelled in time).
 * Exactly once per payment: the payment is claimed (success → refunded) before Paystack is
 * asked, and put back if Paystack refuses, so the BGYM team can retry.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Returns false if there was nothing to refund (not paid, or already refunded). */
  async refund(paymentId: string, actorId: string, reason: string): Promise<boolean> {
    const { count } = await this.prisma.payment.updateMany({ where: { id: paymentId, status: 'success' }, data: { status: 'refunded' } });
    if (!count) return false;
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { reference: true, amountPesewas: true, provider: true } });
    const live = payment.provider === 'paystack' && this.config.get('PAYMENTS_DRIVER', { infer: true }) === 'paystack';
    try {
      if (live) await this.paystack.refund(payment.reference);
    } catch (err) {
      await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'success' } });
      await this.prisma.refund.create({ data: { paymentId, amountPesewas: payment.amountPesewas, reason, status: 'failed', initiatedById: actorId } });
      this.logger.error(`Refund of ${payment.reference} failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.audit.record({ action: 'payment.refund_failed', actorId, targetType: 'payment', targetId: paymentId, metadata: { reason } });
      return false;
    }
    // Paystack refunds money back to the card or wallet over a few days; it's "pending" until then.
    await this.prisma.refund.create({ data: { paymentId, amountPesewas: payment.amountPesewas, reason, status: live ? 'pending' : 'processed', initiatedById: actorId } });
    await this.audit.record({ action: 'payment.refunded', actorId, targetType: 'payment', targetId: paymentId, metadata: { reason, amountPesewas: payment.amountPesewas } });
    return true;
  }
}
