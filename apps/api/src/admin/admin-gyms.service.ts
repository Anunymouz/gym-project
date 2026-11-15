import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminGym, GymStatus, ReviewGymInput } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { gymApprovedEmail, gymReturnedEmail, gymSuspendedEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The BGYM team's view of gyms: review applications, pause and reactivate gyms. */
@Injectable()
export class AdminGymsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(status: GymStatus | 'all', q?: string): Promise<AdminGym[]> {
    const rows = await this.prisma.gym.findMany({
      where: {
        ...(status !== 'all' && { status }),
        ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { addressText: { contains: q, mode: 'insensitive' } }] }),
      },
      // Oldest submissions first, so the queue is fair.
      orderBy: status === 'pending_review' ? { submittedAt: 'asc' } : { createdAt: 'desc' },
      take: 200,
      select: { id: true },
    });
    return this.details(rows.map((r) => r.id));
  }

  async get(gymId: string): Promise<AdminGym> {
    const [gym] = await this.details([gymId]);
    if (!gym) throw new NotFoundException('Gym not found');
    return gym;
  }

  private async details(ids: string[]): Promise<AdminGym[]> {
    if (ids.length === 0) return [];
    const now = new Date();
    const [gyms, locations] = await Promise.all([
      this.prisma.gym.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, name: true, slug: true, status: true, addressText: true, phone: true, description: true, paystackSubaccountCode: true, platformFeeBps: true,
          createdAt: true, submittedAt: true, reviewedAt: true, reviewNote: true,
          staff: { where: { role: 'owner' }, take: 1, orderBy: { createdAt: 'asc' }, select: { user: { select: { name: true, email: true } } } },
          plans: { orderBy: { pricePesewas: 'asc' }, select: { name: true, durationDays: true, pricePesewas: true, isActive: true } },
          _count: { select: { memberships: { where: { status: 'active', endsAt: { gt: now } } } } },
        },
      }),
      this.prisma.$queryRaw<Array<{ id: string; lat: number; lng: number }>>`
        SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM gyms WHERE id = ANY(${ids}::uuid[])`,
    ]);
    const loc = new Map(locations.map((l) => [l.id, { lat: l.lat, lng: l.lng }]));
    const byId = new Map(
      gyms.map((g) => [
        g.id,
        {
          id: g.id, name: g.name, slug: g.slug, status: g.status, addressText: g.addressText, phone: g.phone, description: g.description,
          location: loc.get(g.id) ?? { lat: 0, lng: 0 },
          owner: g.staff[0]?.user ?? null,
          plans: g.plans,
          payoutReady: !!g.paystackSubaccountCode,
          feeBps: g.platformFeeBps,
          activeMembers: g._count.memberships,
          createdAt: g.createdAt.toISOString(),
          submittedAt: g.submittedAt?.toISOString() ?? null,
          reviewedAt: g.reviewedAt?.toISOString() ?? null,
          reviewNote: g.reviewNote,
        } satisfies AdminGym,
      ]),
    );
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async review(gymId: string, adminId: string, input: ReviewGymInput): Promise<AdminGym> {
    const next = input.decision === 'approve' ? 'active' : 'draft';
    const note = input.decision === 'return' ? input.note : null;
    // Only a gym that is waiting can be decided on, and only once (two admins at once).
    const { count } = await this.prisma.gym.updateMany({
      where: { id: gymId, status: 'pending_review' },
      data: { status: next, reviewedAt: new Date(), reviewedById: adminId, reviewNote: note },
    });
    if (count === 0) throw new ConflictException('This gym isn’t waiting for review any more.');
    await this.audit.record({ action: input.decision === 'approve' ? 'gym.approved' : 'gym.returned', actorId: adminId, targetType: 'gym', targetId: gymId, metadata: note ? { note } : {} });

    const gym = await this.get(gymId);
    if (gym.owner) {
      const dashboard = `${this.config.get('WEB_URL', { infer: true })}/gym`;
      await this.mail.send(input.decision === 'approve' ? gymApprovedEmail(gym.owner.email, gym.name, dashboard) : gymReturnedEmail(gym.owner.email, gym.name, note!, dashboard)).catch(() => undefined);
    }
    return gym;
  }

  async suspend(gymId: string, adminId: string, reason: string): Promise<AdminGym> {
    const { count } = await this.prisma.gym.updateMany({ where: { id: gymId, status: 'active' }, data: { status: 'suspended', reviewedAt: new Date(), reviewedById: adminId, reviewNote: reason } });
    if (count === 0) throw new ConflictException('Only live gyms can be paused.');
    await this.audit.record({ action: 'gym.suspended', actorId: adminId, targetType: 'gym', targetId: gymId, metadata: { reason } });
    const gym = await this.get(gymId);
    if (gym.owner) await this.mail.send(gymSuspendedEmail(gym.owner.email, gym.name, reason)).catch(() => undefined);
    return gym;
  }

  async reactivate(gymId: string, adminId: string): Promise<AdminGym> {
    const { count } = await this.prisma.gym.updateMany({ where: { id: gymId, status: 'suspended' }, data: { status: 'active', reviewedAt: new Date(), reviewedById: adminId, reviewNote: null } });
    if (count === 0) throw new ConflictException('Only paused gyms can be reactivated.');
    await this.audit.record({ action: 'gym.reactivated', actorId: adminId, targetType: 'gym', targetId: gymId });
    return this.get(gymId);
  }
}
