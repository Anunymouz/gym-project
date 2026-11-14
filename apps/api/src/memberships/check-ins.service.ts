import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CheckInResponse, Role } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PassService } from './pass.service.js';

/** Front-desk QR check-in: the staff member's phone scans the member's pass. */
@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passes: PassService,
  ) {}

  async checkIn(staff: { userId: string; roles: Role[] }, gymId: string, token: string): Promise<CheckInResponse> {
    const isStaff = await this.prisma.gymStaff.findUnique({ where: { gymId_userId: { gymId, userId: staff.userId } } });
    if (!isStaff && !staff.roles.includes('admin')) throw new ForbiddenException('You are not staff at this gym.');

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
}
