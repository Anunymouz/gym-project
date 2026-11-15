import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PaymentStatusResponse } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PaymentChannel } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FulfilmentRegistry } from './fulfilment.js';
import { ReceiptsService } from './receipts.service.js';

export interface SuccessfulCharge {
  reference: string;
  amountPesewas: number;
  currency: string;
  channel: string;
  /** Unique per provider event, e.g. "paystack:123456". Makes processing idempotent. */
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

const CHANNELS: Record<string, PaymentChannel> = { mobile_money: 'mobile_money', card: 'card', bank: 'bank' };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfilment: FulfilmentRegistry,
    private readonly audit: AuditService,
    private readonly receipts: ReceiptsService,
  ) {}

  /**
   * Records a successful charge exactly once and fulfils what was bought, in one transaction.
   * Replays of the same provider event are ignored. Amount and currency must match what we charged.
   */
  async recordSuccess(charge: SuccessfulCharge): Promise<'processed' | 'duplicate'> {
    let result: { status: 'processed' | 'duplicate'; paymentId?: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { reference: charge.reference } });
        await tx.paymentEvent.create({
          data: { providerEventId: charge.providerEventId, eventType: charge.eventType, payload: charge.payload, paymentId: payment?.id ?? null },
        });
        if (!payment) throw new NotFoundException('Unknown payment reference');
        if (payment.status === 'success') return { status: 'duplicate' as const };
        if (charge.amountPesewas !== payment.amountPesewas || charge.currency !== payment.currency) {
          throw new ConflictException('Charged amount does not match the order');
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'success', paidAt: new Date(), channel: CHANNELS[charge.channel] ?? 'other' },
        });
        await this.fulfilment.get(payment.type)(tx, payment);
        return { status: 'processed' as const, paymentId: payment.id };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
      this.logger.error(`Payment ${charge.reference} not fulfilled: ${err instanceof Error ? err.message : String(err)}`);
      await this.audit.record({ action: 'payment.fulfilment_failed', targetType: 'payment', targetId: charge.reference, metadata: { reason: err instanceof Error ? err.message : 'unknown' } });
      throw err;
    }
    // After the transaction: the receipt is emailed exactly once, and never blocks activation.
    if (result.status === 'processed' && result.paymentId) await this.receipts.send(result.paymentId);
    return result.status;
  }

  async statusFor(userId: string, reference: string): Promise<PaymentStatusResponse> {
    const payment = await this.prisma.payment.findFirst({
      where: { reference, userId },
      select: { reference: true, status: true, membership: { select: { id: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return { reference: payment.reference, status: payment.status, membershipId: payment.membership?.id ?? null };
  }

  async findOwnedPending(userId: string, reference: string) {
    const payment = await this.prisma.payment.findFirst({ where: { reference, userId } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
