import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import {
  ANDROID_CHANNELS,
  BOOKING_HOLD_MINUTES,
  feeFor,
  type BookingCheckout,
  type BookSessionInput,
  type MyBooking,
  type TrainerBooking,
  type TrainerClient,
  type TrainerEarnings,
} from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';
import { FeesService } from '../fees/fees.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { bookingCancelledEmail, bookingReminderEmail, bookingReminderPush, newBookingEmail } from '../mail/templates.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationSettingsService } from '../notifications/notification-settings.service.js';
import { PushService } from '../notifications/push.service.js';
import { FulfilmentRegistry } from '../payments/fulfilment.js';
import { PaystackClient } from '../payments/paystack.client.js';
import { RefundsService } from '../payments/refunds.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { listedWhere, TrainersService } from './trainers.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const myBookingSelect = {
  id: true, status: true, startsAt: true, endsAt: true, note: true, cancelledBy: true, refundDue: true, paymentId: true, packagePurchaseId: true,
  trainer: { select: { id: true, cancelHours: true, photoKey: true, user: { select: { name: true, phone: true } }, gym: { select: { name: true, slug: true, addressText: true } } } },
} satisfies Prisma.BookingSelect;

/**
 * Booking trainers. A single session is held for 15 minutes while the member pays (the money
 * is split at Paystack: the trainer's subaccount gets it minus BGYM's fee); a session from a
 * package is confirmed straight away. Bookings for one trainer are serialised with a row lock,
 * and the database refuses overlapping live bookings, so a slot can't be sold twice.
 */
@Injectable()
export class BookingsService implements OnModuleInit {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trainers: TrainersService,
    private readonly fees: FeesService,
    private readonly paystack: PaystackClient,
    private readonly refunds: RefundsService,
    private readonly fulfilment: FulfilmentRegistry,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly push: PushService,
    private readonly settings: NotificationSettingsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.fulfilment.register('trainer_session', (tx, p) => this.confirmPaidBooking(tx, p.id), (paymentId) => this.afterSessionPaid(paymentId));
    this.fulfilment.register('trainer_package', (tx, p) => this.activatePackage(tx, p.id));
  }

  private get provider(): 'paystack' | 'dev' {
    return this.config.get('PAYMENTS_DRIVER', { infer: true });
  }

  // ── Booking ──

  async book(userId: string, trainerId: string, input: BookSessionInput): Promise<BookingCheckout> {
    const trainer = await this.prisma.trainer.findFirst({
      where: { id: trainerId, ...listedWhere() },
      select: { id: true, userId: true, sessionPricePesewas: true, sessionDurationMin: true, paystackSubaccountCode: true, user: { select: { name: true, email: true } } },
    });
    if (!trainer) throw new NotFoundException('This trainer isn’t available.');
    if (trainer.userId === userId) throw new BadRequestException('You can’t book yourself.');
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + trainer.sessionDurationMin * MINUTE);
    const usePackage = input.packagePurchaseId ?? null;
    const now = new Date();
    const feeBps = usePackage ? 0 : (await this.fees.forTrainer(trainer.id)).bps;
    const amount = trainer.sessionPricePesewas;
    const reference = usePackage ? null : `bgym_${randomUUID().replace(/-/g, '')}`;

    const booking = await this.prisma.$transaction(async (tx) => {
      // One booking at a time per trainer.
      await tx.$queryRaw`SELECT id FROM trainers WHERE id = ${trainer.id}::uuid FOR UPDATE`;
      // Unpaid holds that ran out free their slot.
      await tx.booking.updateMany({ where: { trainerId: trainer.id, status: 'pending', holdExpiresAt: { lte: now } }, data: { status: 'cancelled', cancelledAt: now, cancelledBy: 'system' } });
      // The time must be one the trainer offers and is still free.
      const day = startsAt.toISOString().slice(0, 10);
      const offered = (await this.trainers.freeSlotsFor(trainer.id, trainer.sessionDurationMin, day, 1, now, tx))[0]?.slots ?? [];
      if (!offered.some((s) => s.startsAt === startsAt.toISOString())) throw new ConflictException('That time was just taken or isn’t available. Pick another.');
      // And the member can't be in two sessions at once.
      const clash = await tx.booking.count({ where: { userId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, OR: [{ status: 'confirmed' }, { status: 'pending', holdExpiresAt: { gt: now } }] } });
      if (clash) throw new ConflictException('You already have a session at that time.');

      if (usePackage) {
        const { count } = await tx.packagePurchase.updateMany({
          where: { id: usePackage, userId, trainerId: trainer.id, status: 'active', sessionsRemaining: { gt: 0 }, endsAt: { gte: endsAt } },
          data: { sessionsRemaining: { decrement: 1 } },
        });
        if (!count) throw new BadRequestException('That package has no sessions left, or ends before this session.');
        return tx.booking.create({ data: { trainerId: trainer.id, userId, startsAt, endsAt, status: 'confirmed', packagePurchaseId: usePackage, note: input.note || null } });
      }
      const payment = await tx.payment.create({
        data: {
          userId, type: 'trainer_session', amountPesewas: amount, provider: this.provider, reference: reference!,
          platformFeePesewas: feeFor(amount, feeBps), splitDetails: { trainerId: trainer.id, subaccount: trainer.paystackSubaccountCode, feeBps },
          metadata: { trainerId: trainer.id, startsAt: startsAt.toISOString() },
        },
      });
      return tx.booking.create({ data: { trainerId: trainer.id, userId, startsAt, endsAt, status: 'pending', holdExpiresAt: new Date(now.getTime() + BOOKING_HOLD_MINUTES * MINUTE), paymentId: payment.id, note: input.note || null } });
    });

    if (usePackage) {
      await this.notifyTrainerOfBooking(booking.id);
      return { bookingId: booking.id, packagePurchaseId: usePackage, reference: null, amountPesewas: 0, provider: null, authorizationUrl: null };
    }
    const authorizationUrl = await this.startPayment(reference!, userId, amount, trainer.paystackSubaccountCode, feeFor(amount, feeBps), { payment_type: 'trainer_session', booking_id: booking.id, trainer: trainer.user.name ?? 'Trainer' }, async () => {
      await this.prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'system' } });
    });
    return { bookingId: booking.id, packagePurchaseId: null, reference, amountPesewas: amount, provider: this.provider, authorizationUrl };
  }

  async buyPackage(userId: string, packageId: string): Promise<BookingCheckout> {
    const pkg = await this.prisma.trainerPackage.findFirst({
      where: { id: packageId, isActive: true, trainer: listedWhere() },
      select: { id: true, name: true, sessionsCount: true, validityDays: true, pricePesewas: true, trainer: { select: { id: true, userId: true, paystackSubaccountCode: true, user: { select: { name: true } } } } },
    });
    if (!pkg) throw new NotFoundException('This package isn’t available.');
    if (pkg.trainer.userId === userId) throw new BadRequestException('You can’t buy your own package.');
    const { bps: feeBps } = await this.fees.forTrainer(pkg.trainer.id);
    const fee = feeFor(pkg.pricePesewas, feeBps);
    const reference = `bgym_${randomUUID().replace(/-/g, '')}`;
    const now = new Date();
    const purchase = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          userId, type: 'trainer_package', amountPesewas: pkg.pricePesewas, provider: this.provider, reference, platformFeePesewas: fee,
          splitDetails: { trainerId: pkg.trainer.id, subaccount: pkg.trainer.paystackSubaccountCode, feeBps }, metadata: { packageId: pkg.id },
        },
      });
      return tx.packagePurchase.create({
        data: { trainerPackageId: pkg.id, trainerId: pkg.trainer.id, userId, status: 'pending', sessionsCount: pkg.sessionsCount, sessionsRemaining: pkg.sessionsCount, startsAt: now, endsAt: new Date(now.getTime() + pkg.validityDays * DAY), paymentId: payment.id },
      });
    });
    const authorizationUrl = await this.startPayment(reference, userId, pkg.pricePesewas, pkg.trainer.paystackSubaccountCode, fee, { payment_type: 'trainer_package', package: pkg.name, trainer: pkg.trainer.user.name ?? 'Trainer' }, async () => {
      await this.prisma.packagePurchase.update({ where: { id: purchase.id }, data: { status: 'cancelled' } });
    });
    return { bookingId: null, packagePurchaseId: purchase.id, reference, amountPesewas: pkg.pricePesewas, provider: this.provider, authorizationUrl };
  }

  /** Real payments go to Paystack with the split; the trainer's subaccount bears Paystack's fee. */
  private async startPayment(reference: string, userId: string, amount: number, subaccount: string | null, fee: number, metadata: Record<string, string>, undo: () => Promise<void>): Promise<string | null> {
    if (this.provider !== 'paystack') return null;
    if (!subaccount) {
      await undo();
      throw new ConflictException('This trainer can’t take payments in the app yet.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    try {
      return (await this.paystack.initialize({ reference, email: user.email, amountPesewas: amount, subaccount, platformFeePesewas: fee, metadata })).authorizationUrl;
    } catch (err) {
      await this.prisma.payment.update({ where: { reference }, data: { status: 'failed' } });
      await undo();
      throw err;
    }
  }

  // ── After payment ──

  /** Payment confirmed: the held session is confirmed (or, if the hold ran out and the slot went, it's owed back). */
  private async confirmPaidBooking(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const booking = await tx.booking.findUnique({ where: { paymentId } });
    if (!booking) throw new Error('Booking for payment not found');
    await tx.$queryRaw`SELECT id FROM trainers WHERE id = ${booking.trainerId}::uuid FOR UPDATE`;
    if (booking.status === 'pending') {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'confirmed', holdExpiresAt: null } });
      return;
    }
    if (booking.status === 'cancelled' && booking.cancelledBy === 'system') {
      // Paid after the hold expired: confirm if the time is still free, otherwise refund.
      const clash = await tx.booking.count({ where: { trainerId: booking.trainerId, id: { not: booking.id }, startsAt: { lt: booking.endsAt }, endsAt: { gt: booking.startsAt }, status: { in: ['pending', 'confirmed'] } } });
      if (!clash && booking.startsAt > new Date()) {
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'confirmed', holdExpiresAt: null, cancelledAt: null, cancelledBy: null } });
        return;
      }
      await tx.booking.update({ where: { id: booking.id }, data: { refundDue: true } });
      await tx.auditLog.create({ data: { action: 'booking.paid_after_expiry', targetType: 'booking', targetId: booking.id } });
    }
  }

  private async afterSessionPaid(paymentId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { paymentId }, select: { id: true, status: true, refundDue: true, userId: true } });
    if (!booking) return;
    if (booking.status === 'confirmed') await this.notifyTrainerOfBooking(booking.id);
    else if (booking.refundDue) await this.refunds.refund(paymentId, booking.userId, 'Paid after the slot was released');
  }

  private async activatePackage(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const purchase = await tx.packagePurchase.findUnique({ where: { paymentId }, include: { trainerPackage: { select: { validityDays: true } } } });
    if (!purchase) throw new Error('Package for payment not found');
    const now = new Date();
    // The package runs from when it's paid for.
    await tx.packagePurchase.update({ where: { id: purchase.id }, data: { status: 'active', startsAt: now, endsAt: new Date(now.getTime() + purchase.trainerPackage.validityDays * DAY) } });
  }

  // ── Cancelling ──

  /**
   * Members can cancel up to the session's start. Early enough (the trainer's notice period)
   * and they get their money back, or the session back on their package; later, they don't.
   */
  async cancelByMember(userId: string, bookingId: string): Promise<MyBooking> {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, userId }, select: { id: true, status: true, startsAt: true, paymentId: true, packagePurchaseId: true, trainer: { select: { cancelHours: true } } } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status === 'pending') {
      // Not paid yet: just release the hold.
      await this.prisma.booking.updateMany({ where: { id: b.id, status: 'pending' }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'member' } });
      return this.myBooking(userId, b.id);
    }
    if (b.status !== 'confirmed' || b.startsAt <= new Date()) throw new BadRequestException('This session can’t be cancelled.');
    const free = Date.now() <= b.startsAt.getTime() - b.trainer.cancelHours * HOUR;
    await this.cancel(b, 'member', free, userId);
    return this.myBooking(userId, b.id);
  }

  /** Trainers can cancel any upcoming session; the member always gets a full refund or the session back. */
  async trainerAction(userId: string, bookingId: string, action: 'complete' | 'no_show' | 'cancel'): Promise<TrainerBooking> {
    const t = await this.trainers.requireTrainer(userId);
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, trainerId: t.id }, select: { id: true, status: true, startsAt: true, paymentId: true, packagePurchaseId: true } });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'confirmed') throw new BadRequestException('Only confirmed sessions can be changed.');
    if (action === 'cancel') {
      if (b.startsAt <= new Date()) throw new BadRequestException('This session has started. Mark it completed or as a no-show instead.');
      await this.cancel(b, 'trainer', true, userId);
    } else {
      if (b.startsAt > new Date()) throw new BadRequestException('You can mark a session once it has started.');
      await this.prisma.booking.updateMany({ where: { id: b.id, status: 'confirmed' }, data: { status: action === 'complete' ? 'completed' : 'no_show' } });
    }
    return (await this.trainerBookings(userId, 'all', b.id))[0]!;
  }

  /** The trainer's upcoming sessions are cancelled (refunds and sessions back) when they leave or are removed. */
  async cancelAllUpcoming(trainerId: string, actorId: string): Promise<number> {
    const upcoming = await this.prisma.booking.findMany({ where: { trainerId, status: 'confirmed', startsAt: { gt: new Date() } }, select: { id: true, status: true, startsAt: true, paymentId: true, packagePurchaseId: true } });
    for (const b of upcoming) await this.cancel(b, 'system', true, actorId);
    return upcoming.length;
  }

  private async cancel(b: { id: string; paymentId: string | null; packagePurchaseId: string | null }, by: 'member' | 'trainer' | 'system', free: boolean, actorId: string): Promise<void> {
    const changed = await this.prisma.$transaction(async (tx) => {
      // Exactly once, even with two taps.
      const { count } = await tx.booking.updateMany({ where: { id: b.id, status: 'confirmed' }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: by, refundDue: free && !!b.paymentId } });
      if (count && free && b.packagePurchaseId) await tx.packagePurchase.update({ where: { id: b.packagePurchaseId }, data: { sessionsRemaining: { increment: 1 } } });
      return count > 0;
    });
    if (!changed) return;
    if (free && b.paymentId) await this.refunds.refund(b.paymentId, actorId, by === 'member' ? 'Cancelled by the member in time' : 'Cancelled by the trainer');
    await this.notifyCancellation(b.id, by, free);
  }

  // ── Lists ──

  async myBookings(userId: string): Promise<MyBooking[]> {
    const rows = await this.prisma.booking.findMany({
      where: { userId, OR: [{ status: { in: ['confirmed', 'completed', 'no_show', 'cancelled'] } }, { status: 'pending', holdExpiresAt: { gt: new Date() } }] },
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: myBookingSelect,
    });
    return rows.map((r) => this.toMyBooking(r));
  }

  async myBooking(userId: string, id: string): Promise<MyBooking> {
    const row = await this.prisma.booking.findFirst({ where: { id, userId }, select: myBookingSelect });
    if (!row) throw new NotFoundException('Booking not found');
    return this.toMyBooking(row);
  }

  async trainerBookings(userId: string, scope: 'upcoming' | 'past' | 'all', onlyId?: string): Promise<TrainerBooking[]> {
    const t = await this.trainers.requireTrainer(userId);
    const now = new Date();
    const rows = await this.prisma.booking.findMany({
      where: {
        trainerId: t.id,
        ...(onlyId ? { id: onlyId } : { status: { in: ['confirmed', 'completed', 'no_show', 'cancelled'] } }),
        ...(scope === 'upcoming' && { endsAt: { gt: new Date(now.getTime() - 12 * HOUR) }, status: { in: ['confirmed'] } }),
        ...(scope === 'past' && { OR: [{ startsAt: { lte: now } }, { status: 'cancelled' }] }),
      },
      orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: 200,
      select: { id: true, status: true, startsAt: true, endsAt: true, note: true, cancelledBy: true, packagePurchaseId: true, user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    return rows.map((r) => ({
      id: r.id, status: r.status, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), note: r.note, cancelledBy: r.cancelledBy,
      client: { id: r.user.id, name: r.user.name ?? r.user.email, email: r.user.email, phone: r.user.phone },
      paidWith: r.packagePurchaseId ? 'package' : 'payment',
    }));
  }

  async clients(userId: string): Promise<TrainerClient[]> {
    const t = await this.trainers.requireTrainer(userId);
    const now = new Date();
    const [bookings, packages] = await Promise.all([
      this.prisma.booking.findMany({ where: { trainerId: t.id, status: { in: ['confirmed', 'completed', 'no_show'] } }, select: { startsAt: true, status: true, user: { select: { id: true, name: true, email: true, phone: true } } } }),
      this.prisma.packagePurchase.findMany({ where: { trainerId: t.id, status: 'active', endsAt: { gt: now } }, orderBy: { endsAt: 'desc' }, select: { userId: true, sessionsRemaining: true, endsAt: true, trainerPackage: { select: { name: true } }, user: { select: { id: true, name: true, email: true, phone: true } } } }),
    ]);
    const map = new Map<string, TrainerClient>();
    const get = (u: { id: string; name: string | null; email: string; phone: string | null }) => {
      let c = map.get(u.id);
      if (!c) map.set(u.id, (c = { id: u.id, name: u.name ?? u.email, email: u.email, phone: u.phone, sessions: 0, lastSessionAt: null, nextSessionAt: null, activePackage: null }));
      return c;
    };
    for (const b of bookings) {
      const c = get(b.user);
      const at = b.startsAt.toISOString();
      if (b.startsAt <= now) {
        c.sessions += b.status === 'completed' ? 1 : 0;
        if (!c.lastSessionAt || at > c.lastSessionAt) c.lastSessionAt = at;
      } else if (b.status === 'confirmed' && (!c.nextSessionAt || at < c.nextSessionAt)) c.nextSessionAt = at;
    }
    for (const p of packages) get(p.user).activePackage ??= { name: p.trainerPackage.name, sessionsRemaining: p.sessionsRemaining, endsAt: p.endsAt.toISOString() };
    return [...map.values()].sort((a, b) => (b.nextSessionAt ?? b.lastSessionAt ?? '').localeCompare(a.nextSessionAt ?? a.lastSessionAt ?? ''));
  }

  async earnings(userId: string, month?: string): Promise<TrainerEarnings> {
    const t = await this.trainers.requireTrainer(userId);
    const forTrainer: Prisma.PaymentWhereInput = { status: { in: ['success', 'refunded'] }, OR: [{ booking: { trainerId: t.id } }, { packagePurchase: { trainerId: t.id } }] };
    const first = await this.prisma.payment.findFirst({ where: forTrainer, orderBy: { paidAt: 'asc' }, select: { paidAt: true } });
    const months: string[] = [];
    const now = new Date();
    for (let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); months.length < 24; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))) {
      months.push(d.toISOString().slice(0, 7));
      if (!first?.paidAt || d <= first.paidAt) break;
    }
    const m = month && months.includes(month) ? month : months[0]!;
    const start = new Date(`${m}-01T00:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const rows = await this.prisma.payment.findMany({
      where: { ...forTrainer, paidAt: { gte: start, lt: end } },
      orderBy: { paidAt: 'desc' },
      select: { id: true, paidAt: true, type: true, status: true, amountPesewas: true, platformFeePesewas: true, user: { select: { name: true, email: true } }, booking: { select: { startsAt: true } }, packagePurchase: { select: { trainerPackage: { select: { name: true } } } } },
    });
    const payments = rows.map((r) => ({
      id: r.id,
      paidAt: (r.paidAt ?? start).toISOString(),
      kind: r.type === 'trainer_package' ? ('package' as const) : ('session' as const),
      description: r.packagePurchase ? r.packagePurchase.trainerPackage.name : `Session ${r.booking?.startsAt.toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) ?? ''}`,
      client: r.user.name ?? r.user.email,
      grossPesewas: r.amountPesewas,
      feePesewas: r.platformFeePesewas,
      refunded: r.status === 'refunded',
    }));
    const kept = payments.filter((p) => !p.refunded);
    const gross = kept.reduce((s, p) => s + p.grossPesewas, 0);
    const fee = kept.reduce((s, p) => s + p.feePesewas, 0);
    return { month: m, months, totals: { payments: kept.length, grossPesewas: gross, feePesewas: fee, netPesewas: gross - fee }, payments };
  }

  // ── Scheduled jobs ──

  /** Tidies unpaid holds that ran out (they already stopped blocking the slot). */
  @Cron('0 */5 * * * *', { name: 'booking-holds', waitForCompletion: true })
  async expireHolds(): Promise<number> {
    const { count } = await this.prisma.booking.updateMany({ where: { status: 'pending', holdExpiresAt: { lte: new Date() } }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'system' } });
    return count;
  }

  /** A day before (if booked further ahead) and an hour before: push, and email the day before. */
  @Cron('0 */5 * * * *', { name: 'booking-reminders', waitForCompletion: true })
  async sendReminders(now = new Date()): Promise<number> {
    if (!this.config.get('REMINDERS_ENABLED', { infer: true })) return 0;
    const due = await this.prisma.booking.findMany({
      where: {
        status: 'confirmed',
        startsAt: { gt: now, lte: new Date(now.getTime() + DAY) },
        OR: [{ remindedDayAt: null }, { remindedHourAt: null, startsAt: { lte: new Date(now.getTime() + 70 * MINUTE) } }],
      },
      take: 500,
      select: { id: true, userId: true, startsAt: true, createdAt: true, remindedDayAt: true, remindedHourAt: true, user: { select: { email: true } }, trainer: { select: { user: { select: { name: true } }, gym: { select: { name: true } } } } },
    });
    let sent = 0;
    for (const b of due) {
      const hour = !b.remindedHourAt && b.startsAt.getTime() - now.getTime() <= 70 * MINUTE;
      const kind: 'day' | 'hour' = hour ? 'hour' : 'day';
      // Claim it first, so two servers never remind twice.
      const field = kind === 'hour' ? 'remindedHourAt' : 'remindedDayAt';
      const { count } = await this.prisma.booking.updateMany({ where: { id: b.id, [field]: null }, data: { [field]: now, ...(kind === 'hour' && { remindedDayAt: b.remindedDayAt ?? now }) } });
      if (!count) continue;
      // Booked less than a day ahead: no "tomorrow" reminder, only the hour one.
      if (kind === 'day' && b.startsAt.getTime() - b.createdAt.getTime() < DAY) continue;
      const trainer = b.trainer.user.name ?? 'your trainer';
      const [pushOk, emailOk] = await Promise.all([this.settings.allowing([b.userId], 'bookings', 'push'), this.settings.allowing([b.userId], 'bookings', 'email')]);
      if (pushOk.has(b.userId)) await this.push.send([b.userId], { ...bookingReminderPush(trainer, b.startsAt, kind), channelId: ANDROID_CHANNELS.bookings, data: { url: '/bookings' } });
      if (kind === 'day' && emailOk.has(b.userId)) await this.mail.send(bookingReminderEmail(b.user.email, trainer, b.trainer.gym.name, b.startsAt)).catch(() => undefined);
      sent++;
    }
    return sent;
  }

  // ── helpers ──

  private toMyBooking(r: Prisma.BookingGetPayload<{ select: typeof myBookingSelect }>): MyBooking {
    return {
      id: r.id,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      trainer: { id: r.trainer.id, name: r.trainer.user.name ?? 'Trainer', photoUrl: r.trainer.photoKey ? this.storage.publicUrl(r.trainer.photoKey) : null, phone: r.status === 'confirmed' ? r.trainer.user.phone : null },
      gym: r.trainer.gym,
      paidWith: r.packagePurchaseId ? 'package' : 'payment',
      note: r.note,
      freeCancelUntil: new Date(r.startsAt.getTime() - r.trainer.cancelHours * HOUR).toISOString(),
      cancelledBy: r.cancelledBy,
      refundDue: r.refundDue,
    };
  }

  private async notifyTrainerOfBooking(bookingId: string): Promise<void> {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { startsAt: true, packagePurchaseId: true, user: { select: { name: true, email: true } }, trainer: { select: { user: { select: { email: true } } } } } });
    if (!b) return;
    const url = `${this.config.get('WEB_URL', { infer: true })}/trainer`;
    await this.mail.send(newBookingEmail(b.trainer.user.email, b.user.name ?? b.user.email, b.startsAt, b.packagePurchaseId ? 'package' : 'payment', url)).catch((e: unknown) => this.logger.warn(`Booking email failed: ${String(e)}`));
  }

  private async notifyCancellation(bookingId: string, by: 'member' | 'trainer' | 'system', free: boolean): Promise<void> {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true, startsAt: true, packagePurchaseId: true, user: { select: { name: true, email: true } }, trainer: { select: { user: { select: { name: true, email: true } } } } } });
    if (!b) return;
    const trainerName = b.trainer.user.name ?? 'Your trainer';
    const back = b.packagePurchaseId ? 'The session is back on your package.' : 'You’ll get a full refund to the account you paid with within a few days.';
    if (by === 'member') {
      await this.mail.send(bookingCancelledEmail(b.trainer.user.email, b.user.name ?? b.user.email, b.startsAt, free ? 'The time is free again for other bookings.' : 'It was cancelled late, so it isn’t refunded.')).catch(() => undefined);
      return;
    }
    // Trainer (or the gym / BGYM) cancelled: tell the member, always with their money or session back.
    await this.mail.send(bookingCancelledEmail(b.user.email, by === 'trainer' ? trainerName : 'BGYM', b.startsAt, back)).catch(() => undefined);
    const ok = await this.settings.allowing([b.userId], 'bookings', 'push');
    if (ok.has(b.userId)) await this.push.send([b.userId], { title: 'Session cancelled', body: `${trainerName} can’t make your session. ${back}`, channelId: ANDROID_CHANNELS.bookings, data: { url: '/bookings' } });
  }
}
