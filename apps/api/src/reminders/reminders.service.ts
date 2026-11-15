import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ANDROID_CHANNELS, MANUAL_REMINDER_COOLDOWN_HOURS, REMINDER_SEND_HOURS, type ReminderKind, type RemindResponse } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { renewalReminderEmail, renewalReminderPush } from '../mail/templates.js';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { PushService } from '../notifications/push.service.js';
import { UnsubscribeService } from '../notifications/unsubscribe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Reminder stages, most urgent first. A stage only applies to memberships at least `minLength` long. */
const STAGES: Array<{ kind: Exclude<ReminderKind, 'manual'>; before: number; minLength: number }> = [
  { kind: 'expired', before: 0, minLength: 7 * DAY },
  { kind: 'days_1', before: 1 * DAY, minLength: 7 * DAY },
  { kind: 'days_3', before: 3 * DAY, minLength: 14 * DAY },
  { kind: 'days_7', before: 7 * DAY, minLength: 28 * DAY },
];
/** How long after the end date the "ended" email may still go out (covers quiet hours and downtime). */
const EXPIRED_GRACE = 36 * HOUR;
const MAX_PER_RUN = 500;

interface Candidate {
  id: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  email: string;
  memberName: string | null;
  gymName: string;
  planName: string;
}

/** The single reminder due now for a membership, if any (never an earlier, less urgent one). */
export function dueStage(m: { startsAt: Date; endsAt: Date }, now: Date): Exclude<ReminderKind, 'manual'> | null {
  const left = m.endsAt.getTime() - now.getTime();
  const length = m.endsAt.getTime() - m.startsAt.getTime();
  if (left <= -EXPIRED_GRACE) return null;
  const stage = STAGES.find((s) => left <= s.before);
  return stage && length >= stage.minLength ? stage.kind : null;
}

export const withinSendHours = (now: Date) => {
  const hour = now.getUTCHours(); // Accra is UTC+0 all year
  return hour >= REMINDER_SEND_HOURS.from && hour < REMINDER_SEND_HOURS.to;
};

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly settings: NotificationSettingsService,
    private readonly push: PushService,
    private readonly unsubscribe: UnsubscribeService,
  ) {}

  /**
   * Emails every renewal reminder that is due. Safe to run often and on several servers at
   * once: each reminder is claimed by inserting its row first (unique per membership and
   * stage), and only the server whose insert succeeded sends it.
   */
  async sendDue(now = new Date()): Promise<{ sent: number; failed: number }> {
    if (!withinSendHours(now)) return { sent: 0, failed: 0 };

    // Memberships near or just past their end, for active members who haven't renewed at that gym.
    const rows = await this.prisma.$queryRaw<Candidate[]>`
      SELECT m.id, m."userId", m."startsAt", m."endsAt", u.email, u.name AS "memberName", g.name AS "gymName", p.name AS "planName"
      FROM memberships m
      JOIN users u ON u.id = m."userId"
      JOIN gyms g ON g.id = m."gymId"
      JOIN membership_plans p ON p.id = m."planId"
      WHERE m.status IN ('active', 'expired')
        AND m."endsAt" > ${new Date(now.getTime() - EXPIRED_GRACE)}
        AND m."endsAt" <= ${new Date(now.getTime() + 7 * DAY)}
        AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM memberships r
          WHERE r."userId" = m."userId" AND r."gymId" = m."gymId" AND r.id <> m.id
            AND r.status = 'active' AND r."endsAt" > m."endsAt"
        )
      ORDER BY m."endsAt"
      LIMIT ${MAX_PER_RUN}`;

    const stages = rows.flatMap((m) => {
      const kind = dueStage(m, now);
      return kind ? [{ m, kind }] : [];
    });
    // Respect each member's choices: skip anyone who can't be reached on any channel.
    const channels = await this.reachable(stages.map((s) => s.m.userId));
    const due = stages.filter((s) => channels.email.has(s.m.userId) || channels.push.has(s.m.userId));
    if (due.length === 0) return { sent: 0, failed: 0 };

    const claimed = await this.prisma.membershipReminder.createManyAndReturn({
      data: due.map(({ m, kind }) => ({ membershipId: m.id, kind })),
      skipDuplicates: true,
      select: { id: true, membershipId: true },
    });
    const byMembership = new Map(due.map((d) => [d.m.id, d.m]));

    let sent = 0;
    let failed = 0;
    for (const claim of claimed) {
      const m = byMembership.get(claim.membershipId)!;
      if (await this.deliver(m, now, channels)) {
        sent++;
      } else {
        // Nothing got through: release the claim so the next run tries again.
        await this.prisma.membershipReminder.delete({ where: { id: claim.id } }).catch(() => undefined);
        failed++;
      }
    }
    if (sent || failed) this.logger.log(`Renewal reminders: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }

  /** A reminder sent by gym staff from the dashboard. The caller has checked the staff role. */
  async remindNow(gymId: string, membershipId: string, staffUserId: string, now = new Date()): Promise<RemindResponse> {
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, gymId, status: { in: ['active', 'expired'] }, user: { status: 'active' } },
      select: {
        id: true,
        userId: true,
        startsAt: true,
        endsAt: true,
        user: { select: { email: true, name: true } },
        gym: { select: { name: true } },
        plan: { select: { name: true } },
      },
    });
    if (!m) throw new NotFoundException('Membership not found');
    const channels = await this.reachable([m.userId]);
    if (!channels.email.has(m.userId) && !channels.push.has(m.userId)) {
      throw new ConflictException('This member has turned off renewal reminders.');
    }

    // Lock the membership row so two clicks at once can't both pass the 24-hour check.
    const since = new Date(now.getTime() - MANUAL_REMINDER_COOLDOWN_HOURS * HOUR);
    const reminder = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${m.id}::uuid FOR UPDATE`;
      const recent = await tx.membershipReminder.count({ where: { membershipId: m.id, createdAt: { gt: since } } });
      if (recent > 0) throw new HttpException('This member was already reminded in the last 24 hours.', HttpStatus.TOO_MANY_REQUESTS);
      return tx.membershipReminder.create({ data: { membershipId: m.id, kind: 'manual', sentById: staffUserId }, select: { id: true, createdAt: true } });
    });
    const delivered = await this.deliver(
      { id: m.id, userId: m.userId, startsAt: m.startsAt, endsAt: m.endsAt, email: m.user.email, memberName: m.user.name, gymName: m.gym.name, planName: m.plan.name },
      now,
      channels,
    );
    if (!delivered) {
      await this.prisma.membershipReminder.delete({ where: { id: reminder.id } }).catch(() => undefined);
      throw new HttpException('We couldn’t send the reminder. Please try again in a moment.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.audit.record({ action: 'membership.reminder_sent', actorId: staffUserId, targetType: 'membership', targetId: m.id, metadata: { gymId } });
    return { remindedAt: reminder.createdAt.toISOString() };
  }

  /** Who can get renewal reminders by email, and by push (enabled and with a registered phone). */
  private async reachable(userIds: string[]): Promise<{ email: Set<string>; push: Set<string> }> {
    const [email, pushOn, devices] = await Promise.all([
      this.settings.allowing(userIds, 'renewals', 'email'),
      this.settings.allowing(userIds, 'renewals', 'push'),
      this.push.hasDevice(userIds),
    ]);
    return { email, push: new Set([...pushOn].filter((id) => devices.has(id))) };
  }

  /** Sends on every channel the member allows. True if at least one got through. */
  private async deliver(m: Candidate, now: Date, channels: { email: Set<string>; push: Set<string> }): Promise<boolean> {
    let delivered = false;
    if (channels.email.has(m.userId)) {
      try {
        const unsubscribe = await this.unsubscribe.links(m.userId, 'renewals');
        await this.mail.send(renewalReminderEmail({ to: m.email, memberName: m.memberName, gymName: m.gymName, planName: m.planName, endsAt: m.endsAt, now, unsubscribe }));
        delivered = true;
      } catch {
        // Logged by the mail service; push may still reach them.
      }
    }
    if (channels.push.has(m.userId)) {
      const message = renewalReminderPush({ gymName: m.gymName, planName: m.planName, endsAt: m.endsAt, now });
      const accepted = await this.push.send([m.userId], { ...message, channelId: ANDROID_CHANNELS.reminders, data: { url: '/memberships' } });
      delivered ||= accepted > 0;
    }
    return delivered;
  }

  /** When each membership was last reminded (any kind), for the dashboard. */
  async lastReminded(membershipIds: string[]): Promise<Map<string, Date>> {
    if (membershipIds.length === 0) return new Map();
    const rows = await this.prisma.membershipReminder.groupBy({ by: ['membershipId'], where: { membershipId: { in: membershipIds } }, _max: { createdAt: true } });
    return new Map(rows.flatMap((r) => (r._max.createdAt ? [[r.membershipId, r._max.createdAt] as const] : [])));
  }
}
