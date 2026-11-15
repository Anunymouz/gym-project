import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderAction, OrderStatus, OrderSummary, SellerOrder } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { StorageService } from '../media/storage.service.js';
import { RefundsService } from '../payments/refunds.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderNotifier } from './order-notifier.service.js';

const orderSelect = {
  id: true, number: true, status: true, subtotalPesewas: true, deliveryFeePesewas: true, totalPesewas: true, commissionPesewas: true, createdAt: true,
  addressSnapshot: true, contactPhone: true, note: true, refundDue: true, paymentId: true, userId: true,
  seller: { select: { name: true } },
  user: { select: { name: true, email: true } },
  items: { select: { titleSnapshot: true, quantity: true, unitPricePesewas: true, variant: { select: { product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { thumbKey: true } } } } } } } },
  events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
  delivery: { select: { provider: true, courierName: true, courierPhone: true, trackingUrl: true } },
} satisfies Prisma.OrderSelect;
type Row = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

/** Which actions move an order on, and from where. */
const FLOW: Record<OrderAction['action'], { from: OrderStatus[]; to: OrderStatus }> = {
  preparing: { from: ['paid'], to: 'preparing' },
  ready: { from: ['paid', 'preparing'], to: 'ready_for_pickup' },
  dispatch: { from: ['ready_for_pickup', 'delivery_failed'], to: 'out_for_delivery' },
  delivered: { from: ['out_for_delivery'], to: 'delivered' },
  failed: { from: ['out_for_delivery'], to: 'delivery_failed' },
  cancel: { from: ['paid', 'preparing', 'ready_for_pickup', 'delivery_failed'], to: 'cancelled' },
};

/**
 * Orders after payment. Sellers (a partner, or the BGYM team for BGYM's own and for any order)
 * move them along: preparing → ready → out for delivery (with the rider's details) → delivered.
 * Cancelling before it's out for delivery refunds the member in full and puts the stock back.
 * Every step is recorded on the order's timeline, and each move happens exactly once.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly refunds: RefundsService,
    private readonly notifier: OrderNotifier,
    private readonly audit: AuditService,
  ) {}

  // ── Members ──

  async mine(userId: string): Promise<OrderSummary[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId, OR: [{ status: { not: 'pending_payment' } }, { reservedUntil: { gt: new Date() } }], NOT: { status: 'cancelled', paidAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: orderSelect,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async one(userId: string, orderId: string): Promise<OrderSummary> {
    const row = await this.prisma.order.findFirst({ where: { id: orderId, userId }, select: orderSelect });
    if (!row) throw new NotFoundException('Order not found');
    return this.toSummary(row);
  }

  /** Members can cancel until the seller starts preparing it. */
  async cancelByMember(userId: string, orderId: string): Promise<OrderSummary> {
    const o = await this.prisma.order.findFirst({ where: { id: orderId, userId }, select: { status: true } });
    if (!o) throw new NotFoundException('Order not found');
    if (o.status !== 'paid') throw new BadRequestException(o.status === 'pending_payment' ? 'This order hasn’t been paid.' : 'The seller has started on this order, so it can’t be cancelled here. Contact BGYM support.');
    await this.move(orderId, userId, { action: 'cancel', reason: 'Cancelled by the member' }, ['paid']);
    return this.one(userId, orderId);
  }

  // ── Sellers and the BGYM team ──

  async forSeller(sellerId: string | null, filter: 'open' | 'done' | 'all'): Promise<SellerOrder[]> {
    const open: OrderStatus[] = ['paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivery_failed'];
    const rows = await this.prisma.order.findMany({
      where: {
        ...(sellerId && { sellerId }),
        status: filter === 'open' ? { in: open } : filter === 'done' ? { in: ['delivered', 'cancelled', 'refunded'] } : { not: 'pending_payment' },
        paidAt: { not: null },
      },
      orderBy: { createdAt: filter === 'open' ? 'asc' : 'desc' },
      take: 300,
      select: orderSelect,
    });
    return rows.map((r) => this.toSellerOrder(r));
  }

  async act(sellerId: string | null, actorId: string, orderId: string, action: OrderAction): Promise<SellerOrder> {
    const o = await this.prisma.order.findFirst({ where: { id: orderId, ...(sellerId && { sellerId }) }, select: { id: true } });
    if (!o) throw new NotFoundException('Order not found');
    await this.move(orderId, actorId, action, FLOW[action.action].from);
    const row = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: orderSelect });
    return this.toSellerOrder(row);
  }

  /** Moves an order on, once (conditional on its current status), then refunds/notifies as needed. */
  private async move(orderId: string, actorId: string, action: OrderAction, from: OrderStatus[]): Promise<void> {
    const to = FLOW[action.action].to;
    const note = action.action === 'cancel' ? action.reason : action.action === 'failed' ? action.note : action.action === 'dispatch' ? `${action.courierName} · ${action.courierPhone}` : null;
    const order = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({ where: { id: orderId, status: { in: from } }, data: { status: to, ...(to === 'cancelled' && { cancelReason: note, refundDue: true }) } });
      if (!count) {
        const now = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
        throw new BadRequestException(`This order is ${now.status.replace(/_/g, ' ')}, so that can’t be done.`);
      }
      await tx.orderEvent.create({ data: { orderId, status: to, note, actorId } });
      if (action.action === 'dispatch') {
        await tx.delivery.update({ where: { orderId }, data: { status: 'courier_assigned', courierName: action.courierName, courierPhone: action.courierPhone, trackingUrl: action.trackingUrl ?? null } });
      } else if (action.action === 'delivered') {
        await tx.delivery.update({ where: { orderId }, data: { status: 'delivered' } });
      } else if (action.action === 'failed') {
        await tx.delivery.update({ where: { orderId }, data: { status: 'failed' } });
      } else if (action.action === 'cancel') {
        await tx.delivery.updateMany({ where: { orderId }, data: { status: 'cancelled' } });
        // Stock was taken at payment: put it back.
        const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });
        for (const i of items) await tx.$executeRaw`UPDATE product_variants SET stock = stock + ${i.quantity} WHERE id = ${i.variantId}::uuid`;
      }
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { paymentId: true, totalPesewas: true } });
    });
    await this.audit.record({ action: `order.${action.action}`, actorId, targetType: 'order', targetId: orderId });
    if (action.action === 'cancel' && order.paymentId) await this.refunds.refundPart(order.paymentId, order.totalPesewas, actorId, note ?? 'Order cancelled');
    await this.notifier.member(orderId, to);
  }

  private toSummary(r: Row): OrderSummary {
    const a = r.addressSnapshot as { addressText: string; landmark: string | null; latitude: number; longitude: number };
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      seller: r.seller.name,
      items: r.items.map((i) => ({ title: i.titleSnapshot, quantity: i.quantity, unitPricePesewas: i.unitPricePesewas, thumbUrl: i.variant.product.images[0] ? this.storage.publicUrl(i.variant.product.images[0].thumbKey) : null })),
      subtotalPesewas: r.subtotalPesewas,
      deliveryFeePesewas: r.deliveryFeePesewas,
      totalPesewas: r.totalPesewas,
      createdAt: r.createdAt.toISOString(),
      address: { addressText: a.addressText, landmark: a.landmark, latitude: a.latitude, longitude: a.longitude, contactPhone: r.contactPhone },
      note: r.note,
      events: r.events.map((e) => ({ status: e.status, note: e.status === 'out_for_delivery' ? null : e.note, at: e.createdAt.toISOString() })),
      delivery: r.delivery && r.delivery.courierName ? r.delivery : r.delivery ? { ...r.delivery, courierName: null, courierPhone: null } : null,
      refundDue: r.refundDue,
    };
  }

  private toSellerOrder(r: Row): SellerOrder {
    return { ...this.toSummary(r), events: r.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })), customer: { name: r.user.name ?? r.user.email, phone: r.contactPhone }, commissionPesewas: r.commissionPesewas };
  }
}
