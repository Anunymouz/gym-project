import { ForbiddenException, Injectable } from '@nestjs/common';
import type { GymStaffRole, Role } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** One place that answers "may this person act for this gym?" for every staff route. */
@Injectable()
export class StaffAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the caller's role at the gym. BGYM admins act as owners. */
  async require(user: { userId: string; roles: Role[] }, gymId: string, allowed?: GymStaffRole[]): Promise<GymStaffRole> {
    const staff = await this.prisma.gymStaff.findUnique({ where: { gymId_userId: { gymId, userId: user.userId } }, select: { role: true } });
    const role: GymStaffRole | null = staff?.role ?? (user.roles.includes('admin') ? 'owner' : null);
    if (!role) throw new ForbiddenException('You are not staff at this gym.');
    if (allowed && !allowed.includes(role)) throw new ForbiddenException('Only gym owners and managers can do this.');
    return role;
  }
}
