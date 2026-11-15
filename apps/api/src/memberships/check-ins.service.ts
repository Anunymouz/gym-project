import { Injectable } from '@nestjs/common';
import { ANDROID_CHANNELS, type CheckInResponse, type Role } from '@bgym/shared';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { PushService } from '../notifications/push.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffAccessService } from '../staff/staff-access.service.js';
import { PassService } from './pass.service.js';

/** Front-desk QR check-in: the staff member's phone scans the member's pass. */
@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passes: PassService,
    private readonly access: StaffAccessService,
    private readonly settings: NotificationSettingsService,
    private readonly push: PushService,
  ) {}

  async checkIn(staff: { userId: string; roles: Role[] }, gymId: string, token: string): Promise<CheckInResponse> {
    await this.access.require(staff, gymId);

    const claims = await this.passes.verify(token);
    if (!claims) {
      await this.prisma.checkIn.create({ data: { gymId, scannedById: staff.userId, result: 'invalid' } });
      return { result: 'invalid', member: null, plan: null, endsAt: null };
    }

    const m = await this.prisma.membership.findUnique({
      where: { id: claims.membershipId },
      select: { id: true, userId: true, gymId: true, status: true, endsAt: true, user: { select: { name: true } }, plan: { select: { name: true } }, gym: { select: { name: true } } },
    });
    const now = new Date();
    const result: CheckInResponse['result'] =
      !m || m.userId !== claims.userId ? 'invalid' : m.gymId !== gymId ? 'wrong_gym' : m.status !== 'active' || m.endsAt <= now ? 'expired' : 'ok';

    await this.prisma.checkIn.create({
      data: { gymId, scannedById: staff.userId, result, membershipId: m?.id ?? null, userId: m?.userId ?? null },
    });
    if (m && result === 'ok') this.confirmToMember(m.userId, m.gym.name);
    return {
      result,
      member: m && result !== 'invalid' ? { name: m.user.name } : null,
      plan: m && result !== 'invalid' ? m.plan.name : null,
      endsAt: m && result !== 'invalid' ? m.endsAt.toISOString() : null,
    };
  }

  /** Fallback when there's no camera: look the member up by email. */
  async checkInByEmail(staff: { userId: string; roles: Role[] }, gymId: string, email: string): Promise<CheckInResponse> {
    await this.access.require(staff, gymId);
    const now = new Date();
    const member = await this.prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
    const m = member
      ? await this.prisma.membership.findFirst({
          where: { userId: member.id, gymId, status: { in: ['active', 'expired'] }, startsAt: { lte: now } },
          orderBy: { endsAt: 'desc' },
          select: { id: true, status: true, endsAt: true, plan: { select: { name: true } }, gym: { select: { name: true } } },
        })
      : null;
    // Same response for unknown emails and non-members, so this can't be used to probe accounts.
    if (!member || !m) {
      await this.prisma.checkIn.create({ data: { gymId, scannedById: staff.userId, result: 'invalid' } });
      return { result: 'invalid', member: null, plan: null, endsAt: null };
    }
    const result = m.status === 'active' && m.endsAt > now ? 'ok' : 'expired';
    await this.prisma.checkIn.create({ data: { gymId, scannedById: staff.userId, result, membershipId: m.id, userId: member.id } });
    if (result === 'ok') this.confirmToMember(member.id, m.gym.name);
    return { result, member: { name: member.name }, plan: m.plan.name, endsAt: m.endsAt.toISOString() };
  }

  /** "You're checked in" on the member's phone, if they want it. Never delays or fails the scan. */
  private confirmToMember(userId: string, gymName: string): void {
    void (async () => {
      if (!(await this.settings.allowing([userId], 'check_ins', 'push')).has(userId)) return;
      await this.push.send([userId], { title: 'Checked in', body: `You’re checked in at ${gymName}. Have a good session!`, channelId: ANDROID_CHANNELS.checkIns, data: { url: '/memberships' } });
    })().catch(() => undefined);
  }
}
