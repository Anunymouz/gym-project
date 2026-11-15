import { Injectable, NotFoundException } from '@nestjs/common';
import { MAX_FEE_BPS, type FeeSettings, type GymFee } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const KEY = 'fees.default';
type Stored = { membershipBps?: number | null };
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_FEE_BPS;

/**
 * BGYM's fee on membership payments: one default for every gym, with an optional special
 * rate per gym. Checkout reads it at the moment of payment and stores the amount on the
 * payment, so changing the fee never changes past payments.
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async defaultMembershipBps(): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key: KEY } });
    const bps = (setting?.value as Stored | null)?.membershipBps;
    return valid(bps) ? bps : 0;
  }

  async forGym(gymId: string): Promise<GymFee> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { platformFeeBps: true } });
    if (!gym) throw new NotFoundException('Gym not found');
    return valid(gym.platformFeeBps) ? { bps: gym.platformFeeBps, source: 'gym' } : { bps: await this.defaultMembershipBps(), source: 'default' };
  }

  async settings(): Promise<FeeSettings> {
    const [setting, logs] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { key: KEY } }),
      this.prisma.auditLog.findMany({
        where: { action: { in: ['fees.updated', 'gym.fee_changed'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { createdAt: true, targetId: true, action: true, metadata: true, actor: { select: { name: true, email: true } } },
      }),
    ]);
    const gymIds = logs.filter((l) => l.action === 'gym.fee_changed' && l.targetId).map((l) => l.targetId!);
    const gyms = new Map((await this.prisma.gym.findMany({ where: { id: { in: gymIds } }, select: { id: true, name: true } })).map((g) => [g.id, g.name]));
    const bps = (setting?.value as Stored | null)?.membershipBps;
    return {
      membershipBps: valid(bps) ? bps : 0,
      updatedAt: setting?.updatedAt.toISOString() ?? null,
      history: logs.map((l) => {
        const m = (l.metadata ?? {}) as { fromBps?: number | null; toBps?: number | null };
        return {
          at: l.createdAt.toISOString(),
          by: l.actor ? (l.actor.name ?? l.actor.email) : null,
          gym: l.action === 'gym.fee_changed' && l.targetId ? (gyms.get(l.targetId) ?? 'A deleted gym') : null,
          fromBps: m.fromBps ?? null,
          toBps: m.toBps ?? null,
        };
      }),
    };
  }

  async setDefault(membershipBps: number, adminId: string): Promise<FeeSettings> {
    const from = await this.defaultMembershipBps();
    const existing = await this.prisma.platformSetting.findUnique({ where: { key: KEY } });
    const value = { ...(existing?.value as Record<string, unknown> | null), membershipBps };
    await this.prisma.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    if (from !== membershipBps) {
      await this.audit.record({ action: 'fees.updated', actorId: adminId, targetType: 'platform', metadata: { fromBps: from, toBps: membershipBps } });
    }
    return this.settings();
  }

  async setGymOverride(gymId: string, bps: number | null, adminId: string): Promise<GymFee> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { platformFeeBps: true } });
    if (!gym) throw new NotFoundException('Gym not found');
    await this.prisma.gym.update({ where: { id: gymId }, data: { platformFeeBps: bps } });
    if (gym.platformFeeBps !== bps) {
      await this.audit.record({ action: 'gym.fee_changed', actorId: adminId, targetType: 'gym', targetId: gymId, metadata: { fromBps: gym.platformFeeBps, toBps: bps } });
    }
    return this.forGym(gymId);
  }
}
