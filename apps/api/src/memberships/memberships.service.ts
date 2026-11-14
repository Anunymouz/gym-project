import { ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { CheckoutResponse, MembershipPass, MembershipSummary } from '@bgym/shared';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { FulfilmentRegistry } from '../payments/fulfilment.js';
import { PaystackClient } from '../payments/paystack.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PassService } from './pass.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MembershipsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly fulfilment: FulfilmentRegistry,
    private readonly passes: PassService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.fulfilment.register('membership', (tx, payment) => this.activate(tx, payment.id));
  }

  /** Starts a membership purchase. The price always comes from the database, never the client. */
  async checkout(userId: string, planId: string): Promise<CheckoutResponse> {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, isActive: true, gym: { status: 'active' } },
      include: { gym: { select: { id: true, name: true, platformFeeBps: true, paystackSubaccountCode: true } } },
    });
    if (!plan) throw new NotFoundException('This plan is no longer available.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });

    const feeBps = plan.gym.platformFeeBps ?? (await this.defaultMembershipFeeBps());
    const platformFeePesewas = Math.round((plan.pricePesewas * feeBps) / 10_000);
    const provider = this.config.get('PAYMENTS_DRIVER', { infer: true });
    const reference = `bgym_${randomUUID().replace(/-/g, '')}`;
    const now = new Date();

    const { payment, membership } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          userId,
          type: 'membership',
          amountPesewas: plan.pricePesewas,
          provider,
          reference,
          platformFeePesewas,
          splitDetails: { gymId: plan.gym.id, subaccount: plan.gym.paystackSubaccountCode, feeBps },
          metadata: { planId: plan.id },
        },
      });
      const membership = await tx.membership.create({
        data: { userId, gymId: plan.gym.id, planId: plan.id, paymentId: payment.id, startsAt: now, endsAt: new Date(now.getTime() + plan.durationDays * DAY_MS) },
      });
      return { payment, membership };
    });

    let authorizationUrl: string | null = null;
    if (provider === 'paystack') {
      try {
        ({ authorizationUrl } = await this.paystack.initialize({
          reference,
          email: user.email,
          amountPesewas: plan.pricePesewas,
          subaccount: plan.gym.paystackSubaccountCode,
          platformFeePesewas,
          metadata: { payment_type: 'membership', membership_id: membership.id, gym: plan.gym.name },
        }));
      } catch (err) {
        await this.prisma.$transaction([
          this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } }),
          this.prisma.membership.update({ where: { id: membership.id }, data: { status: 'cancelled' } }),
        ]);
        throw err;
      }
    }
    return { reference, membershipId: membership.id, amountPesewas: plan.pricePesewas, provider, authorizationUrl };
  }

  /** Runs inside the payment transaction. Renewing early extends from the current end date. */
  private async activate(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const membership = await tx.membership.findUniqueOrThrow({ where: { paymentId }, include: { plan: { select: { durationDays: true } } } });
    const now = new Date();
    const current = await tx.membership.findFirst({
      where: { userId: membership.userId, gymId: membership.gymId, status: 'active', endsAt: { gt: now }, id: { not: membership.id } },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });
    const startsAt = current?.endsAt ?? now;
    await tx.membership.update({
      where: { id: membership.id },
      data: { status: 'active', startsAt, endsAt: new Date(startsAt.getTime() + membership.plan.durationDays * DAY_MS) },
    });
  }

  async listForUser(userId: string): Promise<MembershipSummary[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, status: { in: ['active', 'expired'] } },
      orderBy: { endsAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        gym: { select: { name: true, slug: true, coverUrl: true, addressText: true } },
        plan: { select: { name: true, durationDays: true, pricePesewas: true } },
      },
    });
    const now = Date.now();
    return rows.map((m) => ({
      ...m,
      status: m.status === 'active' && m.endsAt.getTime() <= now ? 'expired' : m.status,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
    }));
  }

  /** A fresh QR pass for an active membership the caller owns. */
  async passFor(userId: string, membershipId: string): Promise<MembershipPass> {
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, userId }, select: { id: true, gymId: true, status: true, startsAt: true, endsAt: true } });
    if (!m) throw new NotFoundException('Membership not found');
    const now = new Date();
    if (m.status !== 'active' || m.endsAt <= now) throw new ForbiddenException('This membership has expired. Renew to get your pass.');
    if (m.startsAt > now) throw new ForbiddenException(`This membership starts on ${m.startsAt.toDateString()}.`);
    return this.passes.sign({ membershipId: m.id, gymId: m.gymId, userId });
  }

  private async defaultMembershipFeeBps(): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key: 'fees.default' } });
    const value = (setting?.value as { membershipBps?: number | null } | null)?.membershipBps;
    return typeof value === 'number' && value >= 0 && value <= 5000 ? value : 0;
  }
}
