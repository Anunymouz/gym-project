import { Injectable, NotFoundException } from '@nestjs/common';
import { MAX_FEE_BPS, type FeeSettings, type GymFee } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const KEY = 'fees.default';
type Stored = { membershipBps?: number | null; trainerBps?: number | null };
type Kind = 'membership' | 'trainer';
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_FEE_BPS;

/**
 * BGYM's fees: on membership payments (one default, with an optional special rate per gym)
 * and on trainer sessions and packages (one default, with an optional rate per trainer). Checkout reads it at the moment of payment and stores the amount on the
 * payment, so changing the fee never changes past payments.
 */
@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async defaultMembershipBps(): Promise<number> {
    return this.defaultBps('membership');
  }

  private async defaultBps(kind: Kind): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key: KEY } });
    const bps = (setting?.value as Stored | null)?.[kind === 'membership' ? 'membershipBps' : 'trainerBps'];
    return valid(bps) ? bps : 0;
  }

  /** The fee on a trainer's sessions and packages right now. */
  async forTrainer(trainerId: string): Promise<{ bps: number; source: 'default' | 'trainer' }> {
    const trainer = await this.prisma.trainer.findUnique({ where: { id: trainerId }, select: { platformFeeBps: true } });
    if (!trainer) throw new NotFoundException('Trainer not found');
    return valid(trainer.platformFeeBps) ? { bps: trainer.platformFeeBps, source: 'trainer' } : { bps: await this.defaultBps('trainer'), source: 'default' };
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
    const stored = setting?.value as Stored | null;
    return {
      membershipBps: valid(stored?.membershipBps) ? stored.membershipBps : 0,
      trainerBps: valid(stored?.trainerBps) ? stored.trainerBps : 0,
      updatedAt: setting?.updatedAt.toISOString() ?? null,
      history: logs.map((l) => {
        const m = (l.metadata ?? {}) as { fromBps?: number | null; toBps?: number | null; kind?: Kind };
        return {
          at: l.createdAt.toISOString(),
          by: l.actor ? (l.actor.name ?? l.actor.email) : null,
          gym: l.action === 'gym.fee_changed' && l.targetId ? (gyms.get(l.targetId) ?? 'A deleted gym') : null,
          kind: m.kind ?? 'membership',
          fromBps: m.fromBps ?? null,
          toBps: m.toBps ?? null,
        };
      }),
    };
  }

  async setDefault(input: { membershipBps?: number; trainerBps?: number }, adminId: string): Promise<FeeSettings> {
    const before = await this.settings();
    const existing = await this.prisma.platformSetting.findUnique({ where: { key: KEY } });
    const value = { ...(existing?.value as Record<string, unknown> | null), ...input };
    await this.prisma.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    for (const kind of ['membership', 'trainer'] as const) {
      const to = kind === 'membership' ? input.membershipBps : input.trainerBps;
      const from = kind === 'membership' ? before.membershipBps : before.trainerBps;
      if (to !== undefined && to !== from) await this.audit.record({ action: 'fees.updated', actorId: adminId, targetType: 'platform', metadata: { kind, fromBps: from, toBps: to } });
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
