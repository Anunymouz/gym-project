import { Injectable } from '@nestjs/common';
import type { CheckInResponse, Role } from '@bgym/shared';
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
      select: { id: true, userId: true, gymId: true, status: true, endsAt: true, user: { select: { name: true } }, plan: { select: { name: true } } },
    });
    const now = new Date();
    const result: CheckInResponse['result'] =
      !m || m.userId !== claims.userId ? 'invalid' : m.gymId !== gymId ? 'wrong_gym' : m.status !== 'active' || m.endsAt <= now ? 'expired' : 'ok';

    await this.prisma.checkIn.create({
      data: { gymId, scannedById: staff.userId, result, membershipId: m?.id ?? null, userId: m?.userId ?? null },
    });
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
          select: { id: true, status: true, endsAt: true, plan: { select: { name: true } } },
        })
      : null;
    // Same response for unknown emails and non-members, so this can't be used to probe accounts.
    if (!member || !m) {
      await this.prisma.checkIn.create({ data: { gymId, scannedById: staff.userId, result: 'invalid' } });
      return { result: 'invalid', member: null, plan: null, endsAt: null };
    }
    const result = m.status === 'active' && m.endsAt > now ? 'ok' : 'expired';
    await this.prisma.checkIn.create({ data: { gymId, scannedById: staff.userId, result, membershipId: m.id, userId: member.id } });
    return { result, member: { name: member.name }, plan: m.plan.name, endsAt: m.endsAt.toISOString() };
  }
}
