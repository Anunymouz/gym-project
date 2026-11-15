import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  BOOKING_HORIZON_DAYS,
  INVITATION_TTL_DAYS,
  type AdminTrainer,
  type AvailabilityInput,
  type DaySlots,
  type GymTrainers,
  type MyPackage,
  type MyTrainerInvitation,
  type TimeOffInput,
  type TrainerAvailability,
  type TrainerCard,
  type TrainerDetail,
  type TrainerMe,
  type TrainerPackageInput,
  type TrainerPackageItem,
  type TrainerProfileInput,
  type TrainerSetupStep,
} from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { FeesService } from '../fees/fees.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { trainerInvitationEmail } from '../mail/templates.js';
import { processPhoto } from '../media/image-processor.js';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { freeSlots } from './slots.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_PENDING = 30;
const pending = (now: Date) => ({ acceptedAt: null, closedAt: null, expiresAt: { gt: now } });

/** Members see a trainer when all of this is true. */
export const listedWhere = (): Prisma.TrainerWhereInput => ({
  status: 'active',
  listed: true,
  gym: { status: 'active' },
  user: { status: 'active' },
  sessionPricePesewas: { gt: 0 },
  // A member must be able to pay: no payout account, no listing (checked again at booking).
  paystackSubaccountCode: { not: null },
});

const cardSelect = {
  id: true, specialties: true, sessionPricePesewas: true, sessionDurationMin: true, photoKey: true, photoThumbKey: true,
  user: { select: { name: true } },
  gym: { select: { id: true, name: true, slug: true } },
  packages: { where: { isActive: true }, select: { pricePesewas: true, sessionsCount: true } },
} satisfies Prisma.TrainerSelect;

/**
 * Trainers: gyms invite them by email; they set up a profile, photo, weekly hours, prices,
 * packages and a payout account, then choose to be listed. Members find them in the app.
 */
@Injectable()
export class TrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly fees: FeesService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ── Gym side ──

  async gymTrainers(gymId: string): Promise<GymTrainers> {
    const now = new Date();
    const [trainers, invitations] = await Promise.all([
      this.prisma.trainer.findMany({
        where: { gymId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, status: true, listed: true, specialties: true, sessionPricePesewas: true, createdAt: true,
          user: { select: { name: true, email: true } },
          _count: { select: { bookings: { where: { status: 'confirmed', startsAt: { gt: now } } } } },
        },
      }),
      this.prisma.trainerInvitation.findMany({ where: { gymId, ...pending(now) }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, createdAt: true, expiresAt: true, invitedBy: { select: { name: true, email: true } } } }),
    ]);
    return {
      trainers: trainers.map((t) => ({
        id: t.id, name: t.user.name, email: t.user.email, status: t.status, listed: t.listed, specialties: t.specialties,
        sessionPricePesewas: t.sessionPricePesewas, upcomingBookings: t._count.bookings, joinedAt: t.createdAt.toISOString(),
      })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString(), invitedBy: i.invitedBy ? (i.invitedBy.name ?? i.invitedBy.email) : null })),
    };
  }

  async invite(gymId: string, actorId: string, email: string): Promise<GymTrainers> {
    const now = new Date();
    const existing = await this.prisma.trainer.findFirst({ where: { user: { email } }, select: { gymId: true, status: true } });
    if (existing?.gymId === gymId && existing.status === 'active') throw new ConflictException('That trainer is already at your gym.');
    if (existing && existing.gymId !== gymId && existing.status === 'active') throw new ConflictException('That trainer is linked to another gym. They can join yours once they leave it.');
    const open = await this.prisma.trainerInvitation.findFirst({ where: { gymId, email, ...pending(now) } });
    if (!open && (await this.prisma.trainerInvitation.count({ where: { gymId, ...pending(now) } })) >= MAX_PENDING) throw new ConflictException('Too many invitations are waiting. Cancel some first.');
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * DAY);
    const inv = open
      ? await this.prisma.trainerInvitation.update({ where: { id: open.id }, data: { expiresAt, invitedById: actorId } })
      : await this.prisma.trainerInvitation.create({ data: { gymId, email, expiresAt, invitedById: actorId } });
    await this.audit.record({ action: 'gym.trainer_invited', actorId, targetType: 'gym', targetId: gymId, metadata: { invitationId: inv.id } });
    const [gym, inviter] = await Promise.all([
      this.prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    ]);
    const url = `${this.config.get('WEB_URL', { infer: true })}/sign-in?next=/trainer`;
    await this.mail.send(trainerInvitationEmail(email, gym.name, inviter?.name ?? null, url)).catch(() => undefined);
    return this.gymTrainers(gymId);
  }

  async revokeInvitation(gymId: string, actorId: string, invitationId: string): Promise<GymTrainers> {
    const { count } = await this.prisma.trainerInvitation.updateMany({ where: { id: invitationId, gymId, ...pending(new Date()) }, data: { closedAt: new Date() } });
    if (!count) throw new NotFoundException('Invitation not found');
    await this.audit.record({ action: 'gym.trainer_invitation_revoked', actorId, targetType: 'gym', targetId: gymId, metadata: { invitationId } });
    return this.gymTrainers(gymId);
  }

  /** Stops listing the trainer and unlinks them. Upcoming sessions are cancelled by the caller. */
  async suspend(trainerId: string, actorId: string, action: 'gym.trainer_removed' | 'trainer.suspended', gymId?: string): Promise<void> {
    const { count } = await this.prisma.trainer.updateMany({ where: { id: trainerId, ...(gymId && { gymId }), status: { not: 'suspended' } }, data: { status: 'suspended', listed: false } });
    if (!count) throw new NotFoundException('Trainer not found');
    await this.audit.record({ action, actorId, targetType: 'trainer', targetId: trainerId, metadata: { gymId } });
  }

  // ── The invited person ──

  async myInvitations(userId: string): Promise<MyTrainerInvitation[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const rows = await this.prisma.trainerInvitation.findMany({
      where: { email: user.email, ...pending(new Date()), gym: { status: { in: ['active', 'draft', 'pending_review'] } } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, expiresAt: true, gym: { select: { id: true, name: true } }, invitedBy: { select: { name: true, email: true } } },
    });
    return rows.map((r) => ({ id: r.id, gym: r.gym, invitedBy: r.invitedBy ? (r.invitedBy.name ?? r.invitedBy.email) : null, expiresAt: r.expiresAt.toISOString() }));
  }

  /** Only the person signed in with the invited email can accept, once. A trainer has one gym. */
  async respond(userId: string, invitationId: string, accept: boolean): Promise<{ trainerId: string | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const result = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string; gymId: string; email: string; expiresAt: Date; acceptedAt: Date | null; closedAt: Date | null }>>`
        SELECT id, "gymId", email, "expiresAt", "acceptedAt", "closedAt" FROM trainer_invitations WHERE id = ${invitationId}::uuid FOR UPDATE`;
      if (!row || row.email !== user.email || row.acceptedAt || row.closedAt || row.expiresAt <= new Date()) throw new NotFoundException('This invitation is no longer valid.');
      if (!accept) {
        await tx.trainerInvitation.update({ where: { id: row.id }, data: { closedAt: new Date() } });
        return { gymId: row.gymId, trainerId: null };
      }
      const current = await tx.trainer.findUnique({ where: { userId } });
      if (current && current.status === 'active' && current.gymId !== row.gymId) throw new ConflictException('You’re already a trainer at another gym. Leave it first.');
      const trainer = current
        ? await tx.trainer.update({ where: { id: current.id }, data: { gymId: row.gymId, status: 'active', listed: false } })
        : await tx.trainer.create({ data: { userId, gymId: row.gymId, status: 'active' } });
      await tx.$executeRaw`UPDATE users SET roles = array_append(roles, 'trainer') WHERE id = ${userId}::uuid AND NOT ('trainer' = ANY(roles))`;
      await tx.trainerInvitation.update({ where: { id: row.id }, data: { acceptedAt: new Date() } });
      return { gymId: row.gymId, trainerId: trainer.id };
    });
    await this.audit.record({ action: accept ? 'trainer.invitation_accepted' : 'trainer.invitation_declined', actorId: userId, targetType: 'gym', targetId: result.gymId, metadata: { invitationId } });
    return { trainerId: result.trainerId };
  }

  // ── The trainer ──

  /** The signed-in person's trainer record (suspended trainers can still see their history). */
  async requireTrainer(userId: string, opts: { active?: boolean } = {}) {
    const t = await this.prisma.trainer.findUnique({ where: { userId } });
    if (!t) throw new ForbiddenException('You’re not set up as a trainer yet. Accept your gym’s invitation first.');
    if (opts.active && t.status !== 'active') throw new ForbiddenException('Your trainer profile is paused. Contact your gym.');
    return t;
  }

  async me(userId: string): Promise<TrainerMe> {
    const t = await this.prisma.trainer.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true } }, gym: { select: { id: true, name: true } }, _count: { select: { availability: true } } },
    });
    if (!t) throw new ForbiddenException('You’re not set up as a trainer yet. Accept your gym’s invitation first.');
    return {
      id: t.id,
      name: t.user.name,
      email: t.user.email,
      status: t.status,
      listed: t.listed,
      gym: t.gym,
      bio: t.bio,
      specialties: t.specialties,
      certifications: (t.certifications as string[] | null) ?? [],
      sessionPricePesewas: t.sessionPricePesewas,
      sessionDurationMin: t.sessionDurationMin,
      cancelHours: t.cancelHours,
      photoUrl: t.photoKey ? this.storage.publicUrl(t.photoKey) : null,
      missing: this.missing(t, t._count.availability),
      feeBps: (await this.fees.forTrainer(t.id)).bps,
    };
  }

  private missing(t: { bio: string | null; specialties: string[]; sessionPricePesewas: number; photoKey: string | null; paystackSubaccountCode: string | null }, rules: number): TrainerSetupStep[] {
    const out: TrainerSetupStep[] = [];
    if (!t.bio || t.specialties.length === 0 || t.sessionPricePesewas <= 0) out.push('profile');
    if (!t.photoKey) out.push('photo');
    if (rules === 0) out.push('availability');
    if (!t.paystackSubaccountCode) out.push('payout');
    return out;
  }

  async updateProfile(userId: string, input: TrainerProfileInput): Promise<TrainerMe> {
    const t = await this.requireTrainer(userId);
    await this.prisma.trainer.update({ where: { id: t.id }, data: { bio: input.bio, specialties: [...new Set(input.specialties)], certifications: input.certifications, sessionPricePesewas: input.sessionPricePesewas, sessionDurationMin: input.sessionDurationMin, cancelHours: input.cancelHours } });
    return this.me(userId);
  }

  async setPhoto(userId: string, file: Buffer): Promise<TrainerMe> {
    const t = await this.requireTrainer(userId);
    const photo = await processPhoto(file);
    const id = randomUUID();
    const key = `trainers/${t.id}/${id}.webp`;
    const thumbKey = `trainers/${t.id}/${id}_t.webp`;
    await this.storage.put(key, photo.large.data, 'image/webp');
    await this.storage.put(thumbKey, photo.thumb.data, 'image/webp');
    await this.prisma.trainer.update({ where: { id: t.id }, data: { photoKey: key, photoThumbKey: thumbKey } });
    await this.storage.delete([t.photoKey, t.photoThumbKey].filter((k): k is string => !!k));
    return this.me(userId);
  }

  /** Appear in the app (only once everything is set up), or hide. */
  async setListed(userId: string, listed: boolean): Promise<TrainerMe> {
    const t = await this.requireTrainer(userId, { active: true });
    if (listed) {
      const rules = await this.prisma.availabilityRule.count({ where: { trainerId: t.id } });
      const missing = this.missing(t, rules);
      if (missing.length) throw new BadRequestException(`Finish setting up first: ${missing.join(', ')}.`);
    }
    await this.prisma.trainer.update({ where: { id: t.id }, data: { listed } });
    return this.me(userId);
  }

  async availability(userId: string): Promise<TrainerAvailability> {
    const t = await this.requireTrainer(userId);
    const [rules, off] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { trainerId: t.id }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] }),
      this.prisma.availabilityException.findMany({ where: { trainerId: t.id, type: 'blocked', date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] }),
    ]);
    return {
      rules: rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
      timeOff: off.map((o) => ({ id: o.id, date: o.date.toISOString().slice(0, 10), startTime: o.startTime, endTime: o.endTime })),
    };
  }

  /** Replaces the weekly hours. Booked sessions are kept (the trainer cancels them if needed). */
  async setAvailability(userId: string, input: AvailabilityInput): Promise<TrainerAvailability> {
    const t = await this.requireTrainer(userId);
    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({ where: { trainerId: t.id } }),
      this.prisma.availabilityRule.createMany({ data: input.rules.map((r) => ({ trainerId: t.id, ...r })) }),
      ...(input.rules.length === 0 ? [this.prisma.trainer.update({ where: { id: t.id }, data: { listed: false } })] : []),
    ]);
    return this.availability(userId);
  }

  async addTimeOff(userId: string, input: TimeOffInput): Promise<TrainerAvailability> {
    const t = await this.requireTrainer(userId);
    if (input.date < new Date().toISOString().slice(0, 10)) throw new BadRequestException('Pick today or a later date.');
    if ((await this.prisma.availabilityException.count({ where: { trainerId: t.id, date: { gte: new Date() } } })) >= 60) throw new BadRequestException('That’s a lot of time off. Remove some old entries first.');
    await this.prisma.availabilityException.create({ data: { trainerId: t.id, date: new Date(`${input.date}T00:00:00Z`), startTime: input.startTime ?? null, endTime: input.endTime ?? null, type: 'blocked' } });
    return this.availability(userId);
  }

  async removeTimeOff(userId: string, id: string): Promise<TrainerAvailability> {
    const t = await this.requireTrainer(userId);
    const { count } = await this.prisma.availabilityException.deleteMany({ where: { id, trainerId: t.id } });
    if (!count) throw new NotFoundException('Not found');
    return this.availability(userId);
  }

  async packages(userId: string): Promise<TrainerPackageItem[]> {
    const t = await this.requireTrainer(userId);
    const rows = await this.prisma.trainerPackage.findMany({ where: { trainerId: t.id }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
    return rows.map(toPackage);
  }

  async createPackage(userId: string, input: TrainerPackageInput): Promise<TrainerPackageItem[]> {
    const t = await this.requireTrainer(userId);
    if ((await this.prisma.trainerPackage.count({ where: { trainerId: t.id, isActive: true } })) >= 6) throw new BadRequestException('Up to 6 packages at a time. Turn one off first.');
    await this.prisma.trainerPackage.create({ data: { trainerId: t.id, name: input.name, description: input.description || null, sessionsCount: input.sessionsCount, validityDays: input.validityDays, pricePesewas: input.pricePesewas } });
    return this.packages(userId);
  }

  /** Price and contents can't change once sold (buyers keep what they paid for); turning off hides it. */
  async updatePackage(userId: string, packageId: string, input: { isActive: boolean }): Promise<TrainerPackageItem[]> {
    const t = await this.requireTrainer(userId);
    const { count } = await this.prisma.trainerPackage.updateMany({ where: { id: packageId, trainerId: t.id }, data: { isActive: input.isActive } });
    if (!count) throw new NotFoundException('Package not found');
    return this.packages(userId);
  }

  // ── What members see ──

  async list(viewerId: string, gymSlug?: string): Promise<TrainerCard[]> {
    const myGyms = await this.myGymIds(viewerId);
    const rows = await this.prisma.trainer.findMany({ where: { ...listedWhere(), ...(gymSlug && { gym: { slug: gymSlug, status: 'active' } }) }, take: 100, select: cardSelect });
    return rows
      .map((r) => this.toCard(r, myGyms))
      .sort((a, b) => Number(b.atMyGym) - Number(a.atMyGym) || a.name.localeCompare(b.name));
  }

  async detail(viewerId: string, trainerId: string): Promise<TrainerDetail> {
    const t = await this.prisma.trainer.findFirst({
      where: { id: trainerId, ...listedWhere() },
      select: { ...cardSelect, bio: true, certifications: true, cancelHours: true, packages: { where: { isActive: true }, orderBy: { pricePesewas: 'asc' } } },
    });
    if (!t) throw new NotFoundException('This trainer isn’t available.');
    const [myGyms, mine] = await Promise.all([this.myGymIds(viewerId), this.myPackages(viewerId, trainerId)]);
    return {
      ...this.toCard({ ...t, packages: t.packages }, myGyms),
      bio: t.bio ?? '',
      certifications: (t.certifications as string[] | null) ?? [],
      cancelHours: t.cancelHours,
      packages: t.packages.map(toPackage),
      myPackages: mine,
    };
  }

  async slots(trainerId: string, from: string, days: number): Promise<DaySlots[]> {
    const t = await this.prisma.trainer.findFirst({ where: { id: trainerId, ...listedWhere() }, select: { id: true, sessionDurationMin: true } });
    if (!t) throw new NotFoundException('This trainer isn’t available.');
    return this.freeSlotsFor(t.id, t.sessionDurationMin, from, days);
  }

  async freeSlotsFor(trainerId: string, durationMin: number, from: string, days: number, now = new Date(), tx: Prisma.TransactionClient = this.prisma): Promise<DaySlots[]> {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(start.getTime() + days * DAY);
    const [rules, timeOff, busy] = await Promise.all([
      tx.availabilityRule.findMany({ where: { trainerId }, select: { weekday: true, startTime: true, endTime: true } }),
      tx.availabilityException.findMany({ where: { trainerId, type: 'blocked', date: { gte: start, lt: end } }, select: { date: true, startTime: true, endTime: true } }),
      tx.booking.findMany({
        where: { trainerId, startsAt: { lt: end }, endsAt: { gt: start }, OR: [{ status: 'confirmed' }, { status: 'pending', holdExpiresAt: { gt: now } }] },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    return freeSlots({ rules, timeOff, busy, durationMin, from, days: Math.min(days, BOOKING_HORIZON_DAYS + 1), now });
  }

  async myPackages(userId: string, trainerId?: string): Promise<MyPackage[]> {
    const rows = await this.prisma.packagePurchase.findMany({
      where: { userId, status: 'active', endsAt: { gt: new Date() }, sessionsRemaining: { gt: 0 }, ...(trainerId && { trainerId }) },
      orderBy: { endsAt: 'asc' },
      select: { id: true, sessionsCount: true, sessionsRemaining: true, endsAt: true, trainerPackage: { select: { name: true } }, trainer: { select: { id: true, user: { select: { name: true } } } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.trainerPackage.name, trainer: { id: r.trainer.id, name: r.trainer.user.name ?? 'Trainer' }, sessionsCount: r.sessionsCount, sessionsRemaining: r.sessionsRemaining, endsAt: r.endsAt.toISOString() }));
  }

  // ── BGYM team ──

  async adminList(): Promise<AdminTrainer[]> {
    const rows = await this.prisma.trainer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, status: true, listed: true, sessionPricePesewas: true, platformFeeBps: true, createdAt: true, user: { select: { name: true, email: true } }, gym: { select: { name: true } }, _count: { select: { bookings: { where: { status: { in: ['confirmed', 'completed'] } } } } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.user.name, email: r.user.email, gym: r.gym.name, status: r.status, listed: r.listed, sessionPricePesewas: r.sessionPricePesewas, bookings: r._count.bookings, feeBps: r.platformFeeBps, createdAt: r.createdAt.toISOString() }));
  }

  async reactivate(trainerId: string, actorId: string): Promise<void> {
    const { count } = await this.prisma.trainer.updateMany({ where: { id: trainerId, status: 'suspended' }, data: { status: 'active' } });
    if (!count) throw new NotFoundException('Trainer not found');
    await this.audit.record({ action: 'trainer.reactivated', actorId, targetType: 'trainer', targetId: trainerId });
  }

  async setFee(trainerId: string, bps: number | null, actorId: string): Promise<void> {
    const t = await this.prisma.trainer.findUnique({ where: { id: trainerId }, select: { platformFeeBps: true } });
    if (!t) throw new NotFoundException('Trainer not found');
    await this.prisma.trainer.update({ where: { id: trainerId }, data: { platformFeeBps: bps } });
    if (t.platformFeeBps !== bps) await this.audit.record({ action: 'trainer.fee_changed', actorId, targetType: 'trainer', targetId: trainerId, metadata: { kind: 'trainer', fromBps: t.platformFeeBps, toBps: bps } });
  }

  // ── helpers ──

  private async myGymIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.membership.findMany({ where: { userId, status: 'active', endsAt: { gt: new Date() } }, distinct: ['gymId'], select: { gymId: true } });
    return new Set(rows.map((r) => r.gymId));
  }

  private toCard(r: Prisma.TrainerGetPayload<{ select: typeof cardSelect }>, myGyms: Set<string>): TrainerCard {
    // "From" price: the cheapest per-session price, single or in a package.
    const perSession = r.packages.map((p) => Math.round(p.pricePesewas / p.sessionsCount));
    return {
      id: r.id,
      name: r.user.name ?? 'Trainer',
      photoUrl: r.photoKey ? this.storage.publicUrl(r.photoKey) : null,
      specialties: r.specialties,
      sessionPricePesewas: r.sessionPricePesewas,
      sessionDurationMin: r.sessionDurationMin,
      gym: r.gym,
      atMyGym: myGyms.has(r.gym.id),
      fromPesewas: Math.min(r.sessionPricePesewas, ...perSession),
    };
  }
}

function toPackage(p: { id: string; name: string; description: string | null; sessionsCount: number; validityDays: number; pricePesewas: number; isActive: boolean }): TrainerPackageItem {
  return { id: p.id, name: p.name, description: p.description, sessionsCount: p.sessionsCount, validityDays: p.validityDays, pricePesewas: p.pricePesewas, isActive: p.isActive };
}
