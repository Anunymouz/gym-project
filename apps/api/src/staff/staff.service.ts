import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { CreatePlanInput, GymMember, GymOverview, GymProfile, MembersQuery, OpeningHours, RevenueMonth, StaffGym, StaffPlan, UpdatePlanInput, updateGymProfileSchema } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from '../reminders/reminders.service.js';

const DAY = 24 * 60 * 60 * 1000;
const startOfMonthUtc = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reminders: RemindersService,
  ) {}

  async gymsFor(userId: string): Promise<StaffGym[]> {
    const rows = await this.prisma.gymStaff.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, gym: { select: { id: true, name: true, slug: true, addressText: true, coverUrl: true } } },
    });
    return rows.map((r) => ({ ...r.gym, role: r.role }));
  }

  async overview(gymId: string): Promise<GymOverview> {
    const now = new Date();
    const monthStart = startOfMonthUtc(now);
    const weekAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));

    const [active, expiring, revenue, newMembers, checkIns, payments] = await Promise.all([
      this.prisma.membership.findMany({
        where: { gymId, status: 'active', startsAt: { lte: now }, endsAt: { gt: now } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.expiringMemberships(gymId, now),
      this.prisma.$queryRaw<Array<{ total: bigint | null }>>`
        SELECT SUM(p."amountPesewas" - p."platformFeePesewas") AS total
        FROM payments p JOIN memberships m ON m."paymentId" = p.id
        WHERE m."gymId" = ${gymId}::uuid AND p.status = 'success' AND p."paidAt" >= ${monthStart}`,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM (
          SELECT m."userId", MIN(p."paidAt") AS first_paid
          FROM memberships m JOIN payments p ON p.id = m."paymentId"
          WHERE m."gymId" = ${gymId}::uuid AND p.status = 'success'
          GROUP BY m."userId"
        ) firsts WHERE first_paid >= ${monthStart}`,
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
        FROM check_ins WHERE "gymId" = ${gymId}::uuid AND result = 'ok' AND "createdAt" >= ${weekAgo}
        GROUP BY 1`,
      this.prisma.payment.findMany({
        where: { status: 'success', membership: { gymId } },
        orderBy: { paidAt: 'desc' },
        take: 6,
        select: { id: true, amountPesewas: true, platformFeePesewas: true, channel: true, paidAt: true, user: { select: { name: true } }, membership: { select: { plan: { select: { name: true } } } } },
      }),
    ]);

    const reminded = await this.reminders.lastReminded(expiring.slice(0, 5).map((m) => m.id));
    const byDay = new Map(checkIns.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
    const checkInsByDay = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekAgo.getTime() + i * DAY).toISOString().slice(0, 10);
      return { date, count: byDay.get(date) ?? 0 };
    });

    return {
      activeMembers: active.length,
      newThisMonth: Number(newMembers[0]?.count ?? 0),
      expiringIn7Days: expiring.length,
      revenueThisMonthPesewas: Number(revenue[0]?.total ?? 0),
      checkInsByDay,
      expiringSoon: expiring.slice(0, 5).map((m) => ({ membershipId: m.id, memberName: m.user.name, plan: m.plan.name, endsAt: m.endsAt.toISOString(), lastRemindedAt: reminded.get(m.id)?.toISOString() ?? null })),
      recentPayments: payments.map((p) => ({
        id: p.id,
        memberName: p.user.name,
        plan: p.membership?.plan.name ?? 'Membership',
        channel: p.channel,
        amountPesewas: p.amountPesewas,
        paidAt: (p.paidAt ?? new Date()).toISOString(),
      })),
    };
  }

  /** Active memberships ending within 7 days whose member hasn't already renewed. */
  private async expiringMemberships(gymId: string, now: Date) {
    const soon = await this.prisma.membership.findMany({
      where: { gymId, status: 'active', startsAt: { lte: now }, endsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } },
      orderBy: { endsAt: 'asc' },
      select: { id: true, userId: true, endsAt: true, user: { select: { name: true } }, plan: { select: { name: true } } },
    });
    if (soon.length === 0) return soon;
    const renewed = await this.prisma.membership.findMany({
      where: { gymId, status: 'active', userId: { in: soon.map((m) => m.userId) }, startsAt: { gt: now } },
      select: { userId: true },
    });
    const renewedIds = new Set(renewed.map((r) => r.userId));
    return soon.filter((m) => !renewedIds.has(m.userId));
  }

  async members(gymId: string, query: MembersQuery): Promise<GymMember[]> {
    const now = Date.now();
    const rows = await this.prisma.membership.findMany({
      where: {
        gymId,
        status: { in: ['active', 'expired'] },
        ...(query.q && { user: { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q.toLowerCase() } }] } }),
      },
      orderBy: [{ userId: 'asc' }, { endsAt: 'desc' }],
      distinct: ['userId'],
      take: 500,
      select: { id: true, userId: true, endsAt: true, status: true, user: { select: { name: true, email: true } }, plan: { select: { name: true } } },
    });
    const lastCheckIns = await this.prisma.checkIn.groupBy({
      by: ['userId'],
      where: { gymId, result: 'ok', userId: { in: rows.map((r) => r.userId) } },
      _max: { createdAt: true },
    });
    const lastByUser = new Map(lastCheckIns.map((c) => [c.userId, c._max.createdAt]));
    const reminded = await this.reminders.lastReminded(rows.map((r) => r.id));

    return rows
      .map((r): GymMember => {
        const ends = r.endsAt.getTime();
        const status = r.status === 'expired' || ends <= now ? 'expired' : ends - now <= 7 * DAY ? 'expiring' : 'active';
        return { userId: r.userId, membershipId: r.id, lastRemindedAt: reminded.get(r.id)?.toISOString() ?? null, name: r.user.name, email: r.user.email, plan: r.plan.name, status, endsAt: r.endsAt.toISOString(), lastCheckInAt: lastByUser.get(r.userId)?.toISOString() ?? null };
      })
      .filter((m) => query.filter === 'all' || m.status === query.filter || (query.filter === 'active' && m.status === 'expiring'))
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  }

  async plans(gymId: string): Promise<StaffPlan[]> {
    const now = new Date();
    const plans = await this.prisma.membershipPlan.findMany({
      where: { gymId },
      orderBy: [{ isActive: 'desc' }, { pricePesewas: 'asc' }],
      select: { id: true, name: true, description: true, durationDays: true, pricePesewas: true, isActive: true, _count: { select: { memberships: { where: { status: 'active', endsAt: { gt: now } } } } } },
    });
    return plans.map(({ _count, ...p }) => ({ ...p, activeMembers: _count.memberships }));
  }

  async createPlan(gymId: string, actorId: string, input: CreatePlanInput): Promise<StaffPlan> {
    const plan = await this.prisma.membershipPlan.create({ data: { gymId, ...input, description: input.description ?? null } });
    await this.audit.record({ action: 'gym.plan_created', actorId, targetType: 'membership_plan', targetId: plan.id, metadata: { gymId, ...input, description: input.description ?? null } });
    return { ...plan, activeMembers: 0 };
  }

  /** Price changes apply to new purchases only; existing members keep what they paid for. */
  async updatePlan(gymId: string, planId: string, actorId: string, input: UpdatePlanInput): Promise<StaffPlan> {
    const existing = await this.prisma.membershipPlan.findFirst({ where: { id: planId, gymId } });
    if (!existing) throw new NotFoundException('Plan not found');
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.prisma.membershipPlan.update({ where: { id: planId }, data });
    await this.audit.record({
      action: 'gym.plan_updated',
      actorId,
      targetType: 'membership_plan',
      targetId: planId,
      metadata: { gymId, before: { name: existing.name, pricePesewas: existing.pricePesewas, durationDays: existing.durationDays, isActive: existing.isActive }, changes: data as Record<string, string | number | boolean | null> },
    });
    const [updated] = (await this.plans(gymId)).filter((p) => p.id === planId);
    return updated!;
  }

  private static readonly profileSelect = {
    id: true, slug: true, status: true, name: true, description: true, phone: true, email: true,
    addressText: true, coverUrl: true, facilities: true, openingHours: true, updatedAt: true,
  } as const;

  async profile(gymId: string): Promise<GymProfile> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: StaffService.profileSelect });
    if (!gym) throw new NotFoundException('Gym not found');
    return { ...gym, openingHours: gym.openingHours as OpeningHours, updatedAt: gym.updatedAt.toISOString() };
  }

  async updateProfile(gymId: string, actorId: string, input: z.output<typeof updateGymProfileSchema>): Promise<GymProfile> {
    const before = await this.profile(gymId);
    const gym = await this.prisma.gym.update({ where: { id: gymId }, data: input, select: StaffService.profileSelect });
    const changed = (Object.keys(input) as Array<keyof typeof input>).filter((k) => JSON.stringify(input[k]) !== JSON.stringify(before[k]));
    if (changed.length) await this.audit.record({ action: 'gym.profile_updated', actorId, targetType: 'gym', targetId: gymId, metadata: { changed } });
    return { ...gym, openingHours: gym.openingHours as OpeningHours, updatedAt: gym.updatedAt.toISOString() };
  }

  /** Successful membership payments at this gym in one calendar month (Accra = UTC). */
  async revenue(gymId: string, month?: string): Promise<RevenueMonth> {
    const now = new Date();
    const key = month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [y, m] = key.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const [rows, months] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'success', membership: { gymId }, paidAt: { gte: from, lt: to } },
        orderBy: { paidAt: 'desc' },
        take: 5000,
        select: { id: true, reference: true, paidAt: true, channel: true, amountPesewas: true, platformFeePesewas: true, user: { select: { name: true } }, membership: { select: { plan: { select: { name: true } } } } },
      }),
      this.prisma.$queryRaw<Array<{ month: string }>>`
        SELECT DISTINCT to_char(p."paidAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS month
        FROM payments p JOIN memberships m ON m."paymentId" = p.id
        WHERE m."gymId" = ${gymId}::uuid AND p.status = 'success' AND p."paidAt" IS NOT NULL
        ORDER BY month DESC LIMIT 36`,
    ]);

    const payments = rows.map((p) => ({
      id: p.id,
      reference: p.reference,
      paidAt: p.paidAt!.toISOString(), // filtered on paidAt, so always set
      memberName: p.user.name,
      plan: p.membership?.plan.name ?? 'Membership',
      channel: p.channel,
      grossPesewas: p.amountPesewas,
      feePesewas: p.platformFeePesewas,
      netPesewas: p.amountPesewas - p.platformFeePesewas,
    }));
    const byPlan = new Map<string, { plan: string; payments: number; netPesewas: number }>();
    for (const p of payments) {
      const entry = byPlan.get(p.plan) ?? { plan: p.plan, payments: 0, netPesewas: 0 };
      entry.payments++;
      entry.netPesewas += p.netPesewas;
      byPlan.set(p.plan, entry);
    }
    const sum = (k: 'grossPesewas' | 'feePesewas' | 'netPesewas') => payments.reduce((t, p) => t + p[k], 0);
    const monthList = months.map((r) => r.month);
    if (!monthList.includes(key)) monthList.unshift(key);
    return {
      month: key,
      months: monthList.sort().reverse(),
      totals: { payments: payments.length, grossPesewas: sum('grossPesewas'), feePesewas: sum('feePesewas'), netPesewas: sum('netPesewas') },
      byPlan: [...byPlan.values()].sort((a, b) => b.netPesewas - a.netPesewas),
      payments,
    };
  }
}
