import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreatePartnerInput, PickupLocationInput, SellerAccount } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { partnerWelcomeEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Sellers: BGYM's own store (one "platform" seller, run from the admin dashboard) and store
 * partners (set up by the BGYM team, with their own dashboard, payout account and commission).
 */
@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** BGYM's own seller (created on first use). */
  async platformSellerId(): Promise<string> {
    const existing = await this.prisma.seller.findFirst({ where: { type: 'platform' }, select: { id: true } });
    if (existing) return existing.id;
    return (await this.prisma.seller.create({ data: { type: 'platform', name: 'BGYM Store' }, select: { id: true } })).id;
  }

  /** The partner the signed-in person works for. */
  async partnerSellerId(userId: string): Promise<string> {
    const link = await this.prisma.partnerUser.findFirst({ where: { userId, seller: { type: 'partner' } }, select: { sellerId: true } });
    if (!link) throw new ForbiddenException('You’re not linked to a store partner.');
    return link.sellerId;
  }

  async account(sellerId: string): Promise<SellerAccount> {
    const s = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: {
        id: true, type: true, name: true, commissionBps: true, isActive: true, contactEmail: true, contactPhone: true, paystackSubaccountCode: true,
        users: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Seller not found');
    const [pickup] = await this.prisma.$queryRaw<Array<{ id: string; addressText: string; contactPhone: string; latitude: number; longitude: number }>>`
      SELECT id, "addressText", "contactPhone", ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
      FROM pickup_locations WHERE "sellerId" = ${sellerId}::uuid ORDER BY id LIMIT 1`;
    const counts = await this.prisma.product.groupBy({ by: ['status'], where: { sellerId, status: { in: ['active', 'pending_review'] } }, _count: true });
    return {
      id: s.id,
      type: s.type,
      name: s.name,
      commissionBps: s.commissionBps,
      isActive: s.isActive,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      pickup: pickup ?? null,
      payoutConnected: s.type === 'platform' || !!s.paystackSubaccountCode,
      users: s.users.map((u) => u.user),
      products: { active: counts.find((c) => c.status === 'active')?._count ?? 0, pending: counts.find((c) => c.status === 'pending_review')?._count ?? 0 },
    };
  }

  async list(): Promise<SellerAccount[]> {
    const ids = await this.prisma.seller.findMany({ orderBy: [{ type: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
    return Promise.all(ids.map((s) => this.account(s.id)));
  }

  /** Sets up a partner and links (or creates) the person who will run it. They sign in with that email. */
  async createPartner(actorId: string, input: CreatePartnerInput): Promise<SellerAccount> {
    const seller = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: input.contactEmail }, update: {}, create: { email: input.contactEmail, roles: ['member', 'partner'] } });
      await tx.$executeRaw`UPDATE users SET roles = array_append(roles, 'partner') WHERE id = ${user.id}::uuid AND NOT ('partner' = ANY(roles))`;
      const created = await tx.seller.create({ data: { type: 'partner', name: input.name, contactEmail: input.contactEmail, contactPhone: input.contactPhone, commissionBps: input.commissionBps } });
      await tx.partnerUser.create({ data: { sellerId: created.id, userId: user.id, role: 'owner' } });
      return created;
    });
    await this.audit.record({ action: 'seller.created', actorId, targetType: 'seller', targetId: seller.id, metadata: { commissionBps: input.commissionBps } });
    await this.mail.send(partnerWelcomeEmail(input.contactEmail, input.name, `${this.config.get('WEB_URL', { infer: true })}/sign-in?next=/partner`)).catch(() => undefined);
    return this.account(seller.id);
  }

  /** Commission and pausing. A paused partner's products disappear from the store. */
  async updatePartner(actorId: string, sellerId: string, input: { commissionBps?: number; isActive?: boolean }): Promise<SellerAccount> {
    const s = await this.prisma.seller.findFirst({ where: { id: sellerId, type: 'partner' }, select: { commissionBps: true, isActive: true } });
    if (!s) throw new NotFoundException('Partner not found');
    await this.prisma.seller.update({ where: { id: sellerId }, data: input });
    await this.audit.record({ action: 'seller.updated', actorId, targetType: 'seller', targetId: sellerId, metadata: { from: s, to: input } });
    return this.account(sellerId);
  }

  /** Where riders collect orders. One per seller for now. */
  async setPickup(sellerId: string, actorId: string, input: PickupLocationInput): Promise<SellerAccount> {
    await this.prisma.$transaction(async (tx) => {
      await tx.pickupLocation.deleteMany({ where: { sellerId, orders: { none: {} } } });
      const [kept] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM pickup_locations WHERE "sellerId" = ${sellerId}::uuid LIMIT 1`;
      if (kept) {
        await tx.$executeRaw`UPDATE pickup_locations SET "addressText" = ${input.addressText}, "contactPhone" = ${input.contactPhone},
          location = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography WHERE id = ${kept.id}::uuid`;
      } else {
        await tx.$executeRaw`INSERT INTO pickup_locations (id, "sellerId", "addressText", "contactPhone", location)
          VALUES (gen_random_uuid(), ${sellerId}::uuid, ${input.addressText}, ${input.contactPhone}, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography)`;
      }
    });
    await this.audit.record({ action: 'seller.pickup_set', actorId, targetType: 'seller', targetId: sellerId });
    return this.account(sellerId);
  }
}
