import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { canManageRole, GYM_ROLE_LABELS, INVITATION_TTL_DAYS, type GymStaffRole, type GymTeam, type MyInvitation } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { staffInvitationEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_PENDING = 50;
const pending = (now: Date) => ({ acceptedAt: null, closedAt: null, expiresAt: { gt: now } });

/**
 * A gym's staff. Owners add or remove anyone and change roles; managers handle front desk.
 * Invitations go to an email address and can only be accepted by someone signed in with it.
 * A gym always keeps at least one owner.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async team(gymId: string, viewerId: string): Promise<GymTeam> {
    const now = new Date();
    const [staff, invitations] = await Promise.all([
      this.prisma.gymStaff.findMany({ where: { gymId }, orderBy: { createdAt: 'asc' }, select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } } }),
      this.prisma.gymInvitation.findMany({ where: { gymId, ...pending(now) }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, invitedBy: { select: { name: true, email: true } } } }),
    ]);
    const rank: Record<GymStaffRole, number> = { owner: 0, manager: 1, front_desk: 2 };
    return {
      members: staff
        .map((s) => ({ userId: s.user.id, name: s.user.name, email: s.user.email, role: s.role, joinedAt: s.createdAt.toISOString(), isYou: s.user.id === viewerId }))
        .sort((a, b) => rank[a.role] - rank[b.role]),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, invitedBy: i.invitedBy ? (i.invitedBy.name ?? i.invitedBy.email) : null, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() })),
    };
  }

  async invite(gymId: string, actor: { userId: string; role: GymStaffRole }, email: string, role: GymStaffRole): Promise<GymTeam> {
    if (!canManageRole(actor.role, role)) throw new ForbiddenException('Managers can invite front desk staff only.');
    const now = new Date();
    const existing = await this.prisma.gymStaff.findFirst({ where: { gymId, user: { email } } });
    if (existing) throw new ConflictException('That person is already on your team.');
    const open = await this.prisma.gymInvitation.findFirst({ where: { gymId, email, ...pending(now) } });
    if (!open && (await this.prisma.gymInvitation.count({ where: { gymId, ...pending(now) } })) >= MAX_PENDING) {
      throw new ConflictException('Too many invitations are waiting. Cancel some first.');
    }
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * DAY);
    // Inviting the same email again updates the role and sends a fresh email.
    const invitation = open
      ? await this.prisma.gymInvitation.update({ where: { id: open.id }, data: { role, expiresAt, invitedById: actor.userId } })
      : await this.prisma.gymInvitation.create({ data: { gymId, email, role, expiresAt, invitedById: actor.userId } });
    await this.audit.record({ action: 'gym.staff_invited', actorId: actor.userId, targetType: 'gym', targetId: gymId, metadata: { invitationId: invitation.id, role } });

    const [gym, inviter] = await Promise.all([
      this.prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } }),
    ]);
    const url = `${this.config.get('WEB_URL', { infer: true })}/sign-in?next=/gym`;
    await this.mail.send(staffInvitationEmail(email, gym.name, GYM_ROLE_LABELS[role], inviter?.name ?? null, url)).catch(() => undefined);
    return this.team(gymId, actor.userId);
  }

  async revoke(gymId: string, actor: { userId: string; role: GymStaffRole }, invitationId: string): Promise<GymTeam> {
    const inv = await this.prisma.gymInvitation.findFirst({ where: { id: invitationId, gymId, ...pending(new Date()) } });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (!canManageRole(actor.role, inv.role)) throw new ForbiddenException('Managers can cancel front desk invitations only.');
    await this.prisma.gymInvitation.update({ where: { id: inv.id }, data: { closedAt: new Date() } });
    await this.audit.record({ action: 'gym.invitation_revoked', actorId: actor.userId, targetType: 'gym', targetId: gymId, metadata: { invitationId } });
    return this.team(gymId, actor.userId);
  }

  async changeRole(gymId: string, actorId: string, userId: string, role: GymStaffRole): Promise<GymTeam> {
    await this.withStaffLock(gymId, async (tx) => {
      const member = await tx.gymStaff.findUnique({ where: { gymId_userId: { gymId, userId } } });
      if (!member) throw new NotFoundException('Not on this team');
      if (member.role === role) return;
      if (member.role === 'owner') await this.keepAnOwner(tx, gymId);
      await tx.gymStaff.update({ where: { gymId_userId: { gymId, userId } }, data: { role } });
    });
    await this.audit.record({ action: 'gym.staff_role_changed', actorId, targetType: 'gym', targetId: gymId, metadata: { userId, role } });
    return this.team(gymId, actorId);
  }

  /** Removes someone (or lets a person leave). Access ends immediately: every request re-checks staff. */
  async remove(gymId: string, actor: { userId: string; role: GymStaffRole }, userId: string): Promise<GymTeam> {
    await this.withStaffLock(gymId, async (tx) => {
      const member = await tx.gymStaff.findUnique({ where: { gymId_userId: { gymId, userId } } });
      if (!member) throw new NotFoundException('Not on this team');
      const leaving = userId === actor.userId;
      if (!leaving && !canManageRole(actor.role, member.role)) throw new ForbiddenException('Managers can remove front desk staff only.');
      if (member.role === 'owner') await this.keepAnOwner(tx, gymId);
      await tx.gymStaff.delete({ where: { gymId_userId: { gymId, userId } } });
    });
    await this.audit.record({ action: 'gym.staff_removed', actorId: actor.userId, targetType: 'gym', targetId: gymId, metadata: { userId } });
    return this.team(gymId, actor.userId);
  }

  async myInvitations(userId: string): Promise<MyInvitation[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const rows = await this.prisma.gymInvitation.findMany({
      where: { email: user.email, ...pending(new Date()) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, role: true, expiresAt: true, gym: { select: { id: true, name: true, addressText: true } }, invitedBy: { select: { name: true, email: true } } },
    });
    return rows.map((r) => ({ id: r.id, gymId: r.gym.id, gymName: r.gym.name, gymArea: r.gym.addressText, role: r.role, invitedBy: r.invitedBy ? (r.invitedBy.name ?? r.invitedBy.email) : null, expiresAt: r.expiresAt.toISOString() }));
  }

  /** Only the person signed in with the invited email can accept, once. */
  async respond(userId: string, invitationId: string, accept: boolean): Promise<{ gymId: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const inv = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string; gymId: string; email: string; role: GymStaffRole; expiresAt: Date; acceptedAt: Date | null; closedAt: Date | null }>>`
        SELECT id, "gymId", email, role, "expiresAt", "acceptedAt", "closedAt" FROM gym_invitations WHERE id = ${invitationId}::uuid FOR UPDATE`;
      // Same answer whether it doesn't exist or isn't theirs.
      if (!row || row.email !== user.email || row.acceptedAt || row.closedAt || row.expiresAt <= new Date()) throw new NotFoundException('This invitation is no longer valid.');
      if (!accept) {
        await tx.gymInvitation.update({ where: { id: row.id }, data: { closedAt: new Date() } });
        return row;
      }
      const already = await tx.gymStaff.findUnique({ where: { gymId_userId: { gymId: row.gymId, userId } } });
      if (!already) await tx.gymStaff.create({ data: { gymId: row.gymId, userId, role: row.role } });
      await tx.$executeRaw`UPDATE users SET roles = array_append(roles, 'gym_staff') WHERE id = ${userId}::uuid AND NOT ('gym_staff' = ANY(roles))`;
      await tx.gymInvitation.update({ where: { id: row.id }, data: { acceptedAt: new Date() } });
      return row;
    });
    await this.audit.record({ action: accept ? 'gym.invitation_accepted' : 'gym.invitation_declined', actorId: userId, targetType: 'gym', targetId: inv.gymId, metadata: { invitationId } });
    return { gymId: inv.gymId };
  }

  /** Serialises team changes per gym (row locks), so two at once can't remove the last owner. */
  private withStaffLock<T>(gymId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM gym_staff WHERE "gymId" = ${gymId}::uuid FOR UPDATE`;
      return fn(tx);
    });
  }

  private async keepAnOwner(tx: Prisma.TransactionClient, gymId: string): Promise<void> {
    const owners = await tx.gymStaff.count({ where: { gymId, role: 'owner' } });
    if (owners <= 1) throw new ConflictException('A gym needs at least one owner. Make someone else an owner first.');
  }
}
