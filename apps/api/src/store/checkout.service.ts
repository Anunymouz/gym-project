import { BadRequestException, ConflictException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { ORDER_HOLD_MINUTES, ORDER_NUMBER, type CheckoutQuote, type StoreCheckout, type StoreCheckoutInput } from '@bgym/shared';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { FulfilmentRegistry } from '../payments/fulfilment.js';
import { PaystackClient } from '../payments/paystack.client.js';
import { RefundsService } from '../payments/refunds.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddressesService } from './addresses.service.js';
import { CartService } from './cart.service.js';
import { DeliveryService, type Point } from './delivery.service.js';
import { OrderNotifier } from './order-notifier.service.js';

const MINUTE = 60_000;

type SellerGroup = {
  seller: { id: string; name: string; type: 'platform' | 'partner'; commissionBps: number; subaccount: string | null };
  pickup: { id: string; latitude: number; longitude: number } | null;
  lines: Array<{ variantId: string; title: string; variantName: string; unitPricePesewas: number; quantity: number; available: number }>;
  subtotalPesewas: number;
  deliveryFeePesewas: number;
  distanceMeters: number;
  deliverable: boolean;
};

/**
 * Store checkout. The cart becomes one order per seller (each ships from its own pickup point),
 * all paid with one payment that Paystack splits: each partner gets their items minus BGYM's
 * commission; BGYM keeps its own items, the commissions and the delivery fees. Stock is held
 * for 15 minutes while the member pays, and taken for good when the payment is confirmed.
 */
@Injectable()
export class CheckoutService implements OnModuleInit {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly addresses: AddressesService,
    private readonly delivery: DeliveryService,
    private readonly paystack: PaystackClient,
    private readonly refunds: RefundsService,
    private readonly fulfilment: FulfilmentRegistry,
    private readonly notifier: OrderNotifier,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.fulfilment.register('store_order', (tx, p) => this.markPaid(tx, p.id, p.userId), (paymentId) => this.afterPaid(paymentId));
  }

  private get provider(): 'paystack' | 'dev' {
    return this.config.get('PAYMENTS_DRIVER', { infer: true });
  }

  async quote(userId: string, addressId: string): Promise<CheckoutQuote> {
    const { groups, problem } = await this.plan(userId, addressId);
    const subtotal = groups.reduce((s, g) => s + g.subtotalPesewas, 0);
    const delivery = groups.reduce((s, g) => s + g.deliveryFeePesewas, 0);
    return {
      orders: groups.map((g) => ({ seller: g.seller.name, subtotalPesewas: g.subtotalPesewas, deliveryFeePesewas: g.deliveryFeePesewas, distanceKm: Math.round(g.distanceMeters / 100) / 10, lines: g.lines.length })),
      subtotalPesewas: subtotal,
      deliveryPesewas: delivery,
      totalPesewas: subtotal + delivery,
      problem,
    };
  }

  async checkout(userId: string, input: StoreCheckoutInput): Promise<StoreCheckout> {
    const { groups, problem, address } = await this.plan(userId, input.addressId);
    if (problem) throw new BadRequestException(problem);
    if (this.provider === 'paystack' && groups.some((g) => g.seller.type === 'partner' && !g.seller.subaccount)) {
      throw new ConflictException('One of the sellers in your cart can’t take payments yet. Remove their items to continue.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const reference = `bgym_${randomUUID().replace(/-/g, '')}`;
    const now = new Date();
    const total = groups.reduce((s, g) => s + g.subtotalPesewas + g.deliveryFeePesewas, 0);
    const commission = (g: SellerGroup) => (g.seller.type === 'partner' ? Math.round((g.subtotalPesewas * g.seller.commissionBps) / 10_000) : 0);
    // What each partner receives; BGYM keeps everything else.
    const shares = groups.filter((g) => g.seller.type === 'partner').map((g) => ({ subaccount: g.seller.subaccount, sharePesewas: g.subtotalPesewas - commission(g) }));
    const bgymShare = total - shares.reduce((s, x) => s + x.sharePesewas, 0);

    const orderIds = await this.prisma.$transaction(async (tx) => {
      // Hold the stock: only if enough is free right now (row-level check, so two buyers can't both get the last one).
      for (const line of groups.flatMap((g) => g.lines).sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        const held = await tx.$executeRaw`UPDATE product_variants SET reserved = reserved + ${line.quantity} WHERE id = ${line.variantId}::uuid AND "isActive" AND stock - reserved >= ${line.quantity}`;
        if (!held) throw new ConflictException(`${line.title} (${line.variantName}) just sold out. Update your cart and try again.`);
      }
      const payment = await tx.payment.create({
        data: {
          userId, type: 'store_order', amountPesewas: total, provider: this.provider, reference, platformFeePesewas: bgymShare,
          splitDetails: { orders: groups.map((g) => ({ sellerId: g.seller.id, subaccount: g.seller.subaccount, subtotal: g.subtotalPesewas, commission: commission(g), delivery: g.deliveryFeePesewas })) },
          metadata: { sellers: groups.length },
        },
      });
      const ids: string[] = [];
      for (const g of groups) {
        const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('order_number_seq') AS n`;
        const order = await tx.order.create({
          data: {
            number: ORDER_NUMBER(Number(n)),
            userId,
            sellerId: g.seller.id,
            pickupLocationId: g.pickup!.id,
            status: 'pending_payment',
            subtotalPesewas: g.subtotalPesewas,
            deliveryFeePesewas: g.deliveryFeePesewas,
            totalPesewas: g.subtotalPesewas + g.deliveryFeePesewas,
            commissionPesewas: commission(g),
            addressSnapshot: { label: address.label ?? null, addressText: address.addressText, landmark: address.landmark ?? null, gpsDigitalAddress: address.gpsDigitalAddress, latitude: address.latitude, longitude: address.longitude },
            contactPhone: address.contactPhone,
            note: input.note || null,
            paymentId: payment.id,
            reservedUntil: new Date(now.getTime() + ORDER_HOLD_MINUTES * MINUTE),
            items: { create: g.lines.map((l) => ({ variantId: l.variantId, sellerId: g.seller.id, titleSnapshot: `${l.title} · ${l.variantName}`, unitPricePesewas: l.unitPricePesewas, quantity: l.quantity })) },
            events: { create: { status: 'pending_payment', actorId: userId } },
            delivery: { create: { provider: 'manual', status: 'quoted', quotedFeePesewas: g.deliveryFeePesewas, distanceMeters: g.distanceMeters } },
          },
          select: { id: true },
        });
        ids.push(order.id);
      }
      return ids;
    });

    let authorizationUrl: string | null = null;
    if (this.provider === 'paystack') {
      const partners = shares.filter((s): s is { subaccount: string; sharePesewas: number } => !!s.subaccount);
      try {
        ({ authorizationUrl } = await this.paystack.initialize({
          reference,
          email: user.email,
          amountPesewas: total,
          // One partner: the simple split (BGYM's part as the transaction charge). Several: a multi-split.
          ...(partners.length === 1 ? { subaccount: partners[0]!.subaccount, platformFeePesewas: bgymShare } : partners.length > 1 ? { split: partners } : {}),
          metadata: { payment_type: 'store_order', orders: String(orderIds.length) },
        }));
      } catch (err) {
        await this.prisma.payment.update({ where: { reference }, data: { status: 'failed' } });
        for (const id of orderIds) await this.release(id, 'Payment couldn’t start');
        throw err;
      }
    }
    return { reference, orderIds, amountPesewas: total, provider: this.provider, authorizationUrl };
  }

  /** Payment confirmed: stock is taken for good and sellers can start. A late payment for released stock is refunded unless it's still there. */
  private async markPaid(tx: Prisma.TransactionClient, paymentId: string, userId: string): Promise<void> {
    const orders = await tx.order.findMany({ where: { paymentId }, select: { id: true, status: true, cancelReason: true, items: { select: { variantId: true, quantity: true } } } });
    if (orders.length === 0) throw new Error('Orders for payment not found');
    const now = new Date();
    for (const o of orders) {
      if (o.status === 'pending_payment') {
        for (const i of o.items) await tx.$executeRaw`UPDATE product_variants SET stock = stock - ${i.quantity}, reserved = reserved - ${i.quantity} WHERE id = ${i.variantId}::uuid`;
        await tx.order.update({ where: { id: o.id }, data: { status: 'paid', paidAt: now, reservedUntil: null, events: { create: { status: 'paid' } } } });
      } else if (o.status === 'cancelled' && o.cancelReason === EXPIRED) {
        // Paid after the hold ran out: take the stock if it's all still there, otherwise refund.
        const free = await tx.$queryRaw<Array<{ ok: boolean }>>`
          SELECT bool_and(v.stock - v.reserved >= x.q) AS ok FROM product_variants v
          JOIN (SELECT unnest(${o.items.map((i) => i.variantId)}::uuid[]) AS id, unnest(${o.items.map((i) => i.quantity)}::int[]) AS q) x ON x.id = v.id`;
        if (free[0]?.ok) {
          for (const i of o.items) await tx.$executeRaw`UPDATE product_variants SET stock = stock - ${i.quantity} WHERE id = ${i.variantId}::uuid`;
          await tx.order.update({ where: { id: o.id }, data: { status: 'paid', paidAt: now, cancelReason: null, events: { create: { status: 'paid', note: 'Paid after the hold ran out; items were still available.' } } } });
        } else {
          await tx.order.update({ where: { id: o.id }, data: { refundDue: true } });
        }
      }
    }
    // What was bought leaves the cart.
    await tx.cartItem.deleteMany({ where: { userId, variantId: { in: orders.flatMap((o) => o.items.map((i) => i.variantId)) } } });
  }

  private async afterPaid(paymentId: string): Promise<void> {
    const orders = await this.prisma.order.findMany({ where: { paymentId }, select: { id: true, status: true, refundDue: true, totalPesewas: true, userId: true } });
    for (const o of orders) {
      if (o.status === 'paid') await this.notifier.newOrder(o.id);
      else if (o.refundDue) await this.refunds.refundPart(paymentId, o.totalPesewas, o.userId, 'Paid after the items were released');
    }
  }

  /** Unpaid orders whose hold ran out give their stock back. */
  @Cron('0 */2 * * * *', { name: 'order-holds', waitForCompletion: true })
  async expireHolds(now = new Date()): Promise<number> {
    const due = await this.prisma.order.findMany({ where: { status: 'pending_payment', reservedUntil: { lte: now } }, select: { id: true }, take: 200 });
    for (const o of due) await this.release(o.id, EXPIRED);
    return due.length;
  }

  private async release(orderId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({ where: { id: orderId, status: 'pending_payment' }, data: { status: 'cancelled', cancelReason: reason, reservedUntil: null } });
      if (!count) return;
      const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });
      for (const i of items) await tx.$executeRaw`UPDATE product_variants SET reserved = GREATEST(reserved - ${i.quantity}, 0) WHERE id = ${i.variantId}::uuid`;
      await tx.orderEvent.create({ data: { orderId, status: 'cancelled', note: reason } });
    });
  }

  /** The cart grouped by seller, with stock checked and delivery priced to the address. */
  private async plan(userId: string, addressId: string): Promise<{ groups: SellerGroup[]; problem: string | null; address: Awaited<ReturnType<AddressesService['get']>> }> {
    const [cart, address, settings] = await Promise.all([this.cart.get(userId), this.addresses.get(userId, addressId), this.delivery.settings()]);
    if (cart.lines.length === 0) return { groups: [], problem: 'Your cart is empty.', address };
    const sellers = await this.prisma.seller.findMany({ where: { id: { in: [...new Set(cart.lines.map((l) => l.seller.id))] } }, select: { id: true, name: true, type: true, commissionBps: true, paystackSubaccountCode: true } });
    const pickups = await this.prisma.$queryRaw<Array<{ id: string; sellerId: string; latitude: number; longitude: number }>>`
      SELECT DISTINCT ON ("sellerId") id, "sellerId", ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
      FROM pickup_locations WHERE "sellerId" = ANY(${sellers.map((s) => s.id)}::uuid[]) ORDER BY "sellerId", id`;
    const to: Point = { latitude: address.latitude, longitude: address.longitude };
    const groups: SellerGroup[] = [];
    for (const s of sellers) {
      const lines = cart.lines.filter((l) => l.seller.id === s.id);
      const pickup = pickups.find((p) => p.sellerId === s.id) ?? null;
      const q = pickup ? await this.delivery.quote(pickup, to, settings) : null;
      groups.push({
        seller: { id: s.id, name: s.name, type: s.type, commissionBps: s.commissionBps, subaccount: s.paystackSubaccountCode },
        pickup,
        lines: lines.map((l) => ({ variantId: l.variantId, title: l.title, variantName: l.variantName, unitPricePesewas: l.unitPricePesewas, quantity: l.quantity, available: l.available })),
        subtotalPesewas: lines.reduce((sum, l) => sum + l.unitPricePesewas * l.quantity, 0),
        deliveryFeePesewas: q?.feePesewas ?? 0,
        distanceMeters: q?.distanceMeters ?? 0,
        deliverable: q?.deliverable ?? false,
      });
    }
    const short = cart.lines.find((l) => l.available < l.quantity);
    const noPickup = groups.find((g) => !g.pickup);
    const tooFar = groups.find((g) => g.pickup && !g.deliverable);
    const problem = short
      ? short.available === 0
        ? `${short.title} (${short.variantName}) is sold out. Remove it to continue.`
        : `Only ${short.available} of ${short.title} (${short.variantName}) left. Lower the quantity to continue.`
      : noPickup
        ? `${noPickup.seller.name} can’t deliver yet. Remove their items to continue.`
        : tooFar
          ? `${tooFar.seller.name} doesn’t deliver that far yet (${Math.round(tooFar.distanceMeters / 1000)} km). Choose a closer address.`
          : null;
    return { groups, problem, address };
  }
}

export const EXPIRED = 'Payment wasn’t completed in time';
