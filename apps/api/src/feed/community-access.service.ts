import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Viewer {
  userId: string;
  roles: Role[];
}

/** What a person can see and do in gym communities. */
export interface Audience {
  userId: string;
  admin: boolean;
  /** Gyms where they have an active membership: they can post, comment and like there. */
  memberOf: Set<string>;
  /** Gyms they work at, with their role. Staff see and moderate their gym's community. */
  staffAt: Map<string, 'owner' | 'manager' | 'front_desk'>;
  /** People they blocked or who blocked them: neither sees the other's posts, comments or stories. */
  hidden: Set<string>;
}

/**
 * The rules for gym communities, in one place:
 * - a gym's own posts are public (they're on its page);
 * - members' posts, comments and stories are for that gym's active members and staff only;
 * - blocking hides both people from each other.
 */
@Injectable()
export class CommunityAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async audience(viewer: Viewer): Promise<Audience> {
    const now = new Date();
    const [memberships, staff, blocks] = await Promise.all([
      this.prisma.membership.findMany({ where: { userId: viewer.userId, status: 'active', endsAt: { gt: now }, gym: { status: 'active' } }, distinct: ['gymId'], select: { gymId: true } }),
      this.prisma.gymStaff.findMany({ where: { userId: viewer.userId }, select: { gymId: true, role: true } }),
      this.prisma.userBlock.findMany({ where: { OR: [{ blockerId: viewer.userId }, { blockedId: viewer.userId }] }, select: { blockerId: true, blockedId: true } }),
    ]);
    return {
      userId: viewer.userId,
      admin: viewer.roles.includes('admin'),
      memberOf: new Set(memberships.map((m) => m.gymId)),
      staffAt: new Map(staff.map((s) => [s.gymId, s.role])),
      hidden: new Set(blocks.map((b) => (b.blockerId === viewer.userId ? b.blockedId : b.blockerId))),
    };
  }

  /** Gyms whose community the person is part of (member or staff). */
  communityGyms(a: Audience): string[] {
    return [...new Set([...a.memberOf, ...a.staffAt.keys()])];
  }

  /** Can see a member's content in this gym (or interact with anything in it). */
  inCommunity(a: Audience, gymId: string): boolean {
    return a.admin || a.memberOf.has(gymId) || a.staffAt.has(gymId);
  }

  /** Owners and managers moderate their gym's community; so does the BGYM team. */
  moderates(a: Audience, gymId: string): boolean {
    const role = a.staffAt.get(gymId);
    return a.admin || role === 'owner' || role === 'manager';
  }

  canSee(a: Audience, item: { gymId: string; authorKind: 'gym' | 'member'; authorUserId: string }): boolean {
    if (item.authorKind === 'member' && a.hidden.has(item.authorUserId)) return false;
    return item.authorKind === 'gym' || this.inCommunity(a, item.gymId);
  }

  /** Posting a member post or story: an active membership, and the community rules accepted. */
  async requireCanPost(a: Audience, gymId: string): Promise<void> {
    if (!a.memberOf.has(gymId)) throw new ForbiddenException('You can post in gyms where you have an active membership.');
    await this.requireRules(a.userId);
  }

  async requireRules(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { communityAcceptedAt: true } });
    if (!user?.communityAcceptedAt) throw new ForbiddenException({ message: 'Agree to the community rules first.', code: 'community_rules' });
  }
}
