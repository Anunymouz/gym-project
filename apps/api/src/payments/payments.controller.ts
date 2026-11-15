import { Controller, Get, HttpCode, HttpStatus, Logger, NotFoundException, Param, Post, Req, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { paymentReferenceSchema, type PaymentStatusResponse } from '@bgym/shared';
import { CurrentUser, Public } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PaymentsService } from './payments.service.js';
import { PaystackClient } from './paystack.client.js';
import { RefundsService } from './refunds.service.js';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly paystack: PaystackClient,
    private readonly refunds: RefundsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Paystack webhook. Trusted only if the HMAC signature matches; with live payments the
   * transaction is also re-verified with Paystack's API before anything is activated.
   */
  @Public()
  @SkipThrottle()
  @Post('paystack/webhook')
  @HttpCode(HttpStatus.OK)
  async paystackWebhook(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const signature = req.headers['x-paystack-signature'];
    if (!req.rawBody || !this.paystack.isValidSignature(req.rawBody, typeof signature === 'string' ? signature : undefined)) {
      throw new UnauthorizedException('Invalid signature');
    }
    const event = req.body as { event?: string; data?: { id?: number; reference?: string; transaction_reference?: string; amount?: number; currency?: string; channel?: string; status?: string } };
    // Refunds: Paystack tells us when the money is back with the customer (or the refund failed).
    if ((event.event === 'refund.processed' || event.event === 'refund.failed') && event.data?.transaction_reference) {
      await this.refunds.onProviderUpdate(event.data.transaction_reference, event.event === 'refund.processed' ? 'processed' : 'failed');
      return { received: true };
    }
    if (event.event !== 'charge.success' || !event.data?.reference || event.data.id === undefined) return { received: true };

    let tx = { id: event.data.id, reference: event.data.reference, amount: event.data.amount ?? -1, currency: event.data.currency ?? '', channel: event.data.channel ?? 'other', status: event.data.status ?? '' };
    if (this.config.get('PAYMENTS_DRIVER', { infer: true }) === 'paystack') tx = await this.paystack.verify(tx.reference);
    if (tx.status !== 'success') return { received: true };

    await this.payments.recordSuccess({
      reference: tx.reference,
      amountPesewas: tx.amount,
      currency: tx.currency,
      channel: tx.channel,
      providerEventId: `paystack:${tx.id}`,
      eventType: 'charge.success',
      payload: req.body as Prisma.InputJsonValue,
    });
    return { received: true };
  }

  /** The app polls this after returning from checkout. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':reference')
  status(@CurrentUser() user: AccessClaims, @Param('reference', { schema: paymentReferenceSchema }) reference: string): Promise<PaymentStatusResponse> {
    return this.payments.statusFor(user.userId, reference);
  }

  /** Development only: completes a payment as if the member had paid with MoMo. */
  @Post(':reference/simulate')
  @HttpCode(HttpStatus.OK)
  async simulate(@CurrentUser() user: AccessClaims, @Param('reference', { schema: paymentReferenceSchema }) reference: string): Promise<PaymentStatusResponse> {
    if (this.config.get('PAYMENTS_DRIVER', { infer: true }) !== 'dev') throw new NotFoundException();
    const payment = await this.payments.findOwnedPending(user.userId, reference);
    if (payment.provider !== 'dev') throw new NotFoundException();
    this.logger.warn(`[development payment] simulating success for ${reference}`);
    await this.payments.recordSuccess({
      reference,
      amountPesewas: payment.amountPesewas,
      currency: payment.currency,
      channel: 'mobile_money',
      providerEventId: `dev:${reference}`,
      eventType: 'dev.charge.success',
      payload: { simulated: true },
    });
    return this.payments.statusFor(user.userId, reference);
  }
}
