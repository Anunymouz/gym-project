import { Injectable } from '@nestjs/common';
import type { PaymentType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';

export type FulfilmentHandler = (tx: Prisma.TransactionClient, payment: { id: string; userId: string }) => Promise<void>;
/** Runs after the payment is committed (emails, pushes). Errors are logged, never thrown back. */
export type AfterFulfilment = (paymentId: string) => Promise<void>;

/**
 * What to do when a payment succeeds, by payment type. Features register their handler
 * (memberships now; trainer bookings and store orders later) so payments stay decoupled.
 */
@Injectable()
export class FulfilmentRegistry {
  private readonly handlers = new Map<PaymentType, FulfilmentHandler>();
  private readonly afters = new Map<PaymentType, AfterFulfilment>();

  register(type: PaymentType, handler: FulfilmentHandler, after?: AfterFulfilment): void {
    this.handlers.set(type, handler);
    if (after) this.afters.set(type, after);
  }

  after(type: PaymentType): AfterFulfilment | undefined {
    return this.afters.get(type);
  }

  get(type: PaymentType): FulfilmentHandler {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No fulfilment handler for payment type ${type}`);
    return handler;
  }
}
