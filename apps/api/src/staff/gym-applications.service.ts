import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { applyGymSchema, GymApplicationResponse, GymReadiness, OpeningHours } from '@bgym/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { gymSubmittedEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A person can have a few gyms in progress at once (stops someone flooding the review queue). */
const MAX_GYMS_IN_PROGRESS = 3;

export const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'gym';

/** Listing a new gym: apply, fill in the details, then send it to the BGYM team for review. */
@Injectable()
export class GymApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async apply(userId: string, input: z.output<typeof applyGymSchema>): Promise<GymApplicationResponse> {
    const inProgress = await this.prisma.gymStaff.count({ where: { userId, role: 'owner', gym: { status: { in: ['draft', 'pending_review'] } } } });
    if (inProgress >= MAX_GYMS_IN_PROGRESS) throw new ConflictException('Finish setting up your other gyms before adding another.');

    const area = input.addressText.split(',')[0] ?? '';
    const base = slugify(`${input.name} ${input.name.toLowerCase().includes(area.toLowerCase()) ? '' : area}`);
    const taken = new Set((await this.prisma.gym.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((g) => g.slug));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

    const empty: OpeningHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const gymId = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO gyms (id, name, slug, description, phone, "addressText", location, "openingHours", facilities, status, "updatedAt")
        VALUES (gen_random_uuid(), ${input.name}, ${slug}, ${input.description || null}, ${input.phone}, ${input.addressText},
                ST_SetSRID(ST_MakePoint(${input.location.lng}, ${input.location.lat}), 4326)::geography,
                ${JSON.stringify(empty)}::jsonb, ${[] as string[]}, 'draft', now())
        RETURNING id`;
      if (!row) throw new Error('Gym insert failed');
      await tx.gymStaff.create({ data: { gymId: row.id, userId, role: 'owner' } });
      // Mark them as gym staff (array_append only if missing).
      await tx.$executeRaw`UPDATE users SET roles = array_append(roles, 'gym_staff') WHERE id = ${userId}::uuid AND NOT ('gym_staff' = ANY(roles))`;
      return row.id;
    });
    await this.audit.record({ action: 'gym.applied', actorId: userId, targetType: 'gym', targetId: gymId, metadata: { name: input.name } });
    return { id: gymId, slug };
  }

  async readiness(gymId: string): Promise<GymReadiness> {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: {
        status: true, reviewNote: true, submittedAt: true, description: true, phone: true, openingHours: true, paystackSubaccountCode: true,
        _count: { select: { plans: { where: { isActive: true } }, photos: true } },
      },
    });
    if (!gym) throw new NotFoundException('Gym not found');
    const hours = gym.openingHours as OpeningHours;
    const steps = {
      profile: !!gym.phone && (gym.description?.trim().length ?? 0) >= 30,
      photos: gym._count.photos > 0,
      hours: Object.values(hours).some((d) => d.length > 0),
      plans: gym._count.plans > 0,
      payout: !!gym.paystackSubaccountCode,
    };
    return {
      status: gym.status,
      reviewNote: gym.reviewNote,
      submittedAt: gym.submittedAt?.toISOString() ?? null,
      steps,
      canSubmit: gym.status === 'draft' && Object.values(steps).every(Boolean),
    };
  }

  async submit(gymId: string, userId: string): Promise<GymReadiness> {
    const ready = await this.readiness(gymId);
    if (ready.status !== 'draft') throw new ConflictException(ready.status === 'pending_review' ? 'This gym is already waiting for review.' : 'This gym is already live.');
    if (!ready.canSubmit) throw new BadRequestException('Finish the steps in the checklist first.');
    // Only move draft → pending_review (guards against double submits).
    const { count } = await this.prisma.gym.updateMany({ where: { id: gymId, status: 'draft' }, data: { status: 'pending_review', submittedAt: new Date() } });
    if (count === 0) throw new ConflictException('This gym was just submitted.');
    await this.audit.record({ action: 'gym.submitted', actorId: userId, targetType: 'gym', targetId: gymId });

    const [gym, admins] = await Promise.all([
      this.prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { name: true } }),
      this.prisma.user.findMany({ where: { roles: { has: 'admin' }, status: 'active' }, select: { email: true }, take: 20 }),
    ]);
    const url = `${this.config.get('WEB_URL', { infer: true })}/admin/approvals`;
    await Promise.allSettled(admins.map((a) => this.mail.send(gymSubmittedEmail(a.email, gym.name, url))));
    return this.readiness(gymId);
  }
}

