import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PushService } from '../src/notifications/push.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { BookingsService } from '../src/trainers/bookings.service.js';

const run = `trn${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 86_400_000;
const allWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startTime: '06:00', endTime: '20:00' }));

describe('Trainers and bookings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  let gymId = '';
  let otherGymId = '';
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'gym_staff' | 'admin' | 'trainer'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles } });
    users.push(u.id);
    const session = async () => ({ Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).roles, {})).accessToken}` });
    return { ...u, auth: await session(), refresh: session };
  }
  async function owner(gym: string, label: string) {
    const o = await user(label, ['member', 'gym_staff']);
    await prisma.gymStaff.create({ data: { gymId: gym, userId: o.id, role: 'owner' } });
    return o;
  }
  /** A trainer at the gym, fully set up and listed. */
  async function readyTrainer(gym: string, label: string, gymOwner: { auth: Record<string, string> }) {
    const t = await user(label);
    await http().post(`/v1/staff/gyms/${gym}/trainer-invitations`).set(gymOwner.auth).send({ email: t.email }).expect(201);
    const [inv] = (await http().get('/v1/me/trainer-invitations').set(t.auth).expect(200)).body;
    await http().post(`/v1/me/trainer-invitations/${inv.id}/accept`).set(t.auth).expect(200);
    const auth = await t.refresh(); // the new "trainer" role is in the next token
    await http().put('/v1/trainer/me').set(auth).send({ bio: 'Ten years coaching strength and conditioning in Accra.', specialties: ['Strength', 'Weight loss'], certifications: ['ACE CPT'], sessionPricePesewas: 15000, sessionDurationMin: 60, cancelHours: 24 }).expect(200);
    await http().put('/v1/trainer/availability').set(auth).send({ rules: allWeek }).expect(200);
    const photo = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#6c5ce7' } }).jpeg().toBuffer();
    await http().post('/v1/trainer/me/photo').set(auth).attach('photo', photo, 'me.jpg').expect(201);
    const trainer = await prisma.trainer.findUniqueOrThrow({ where: { userId: t.id } });
    await prisma.trainer.update({ where: { id: trainer.id }, data: { paystackSubaccountCode: `ACCT_dev_${run}${label}` } });
    await http().put('/v1/trainer/me/listed').set(auth).send({ listed: true }).expect(200);
    return { ...t, auth, trainerId: trainer.id };
  }
  const tomorrow = () => new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const slotsOn = async (auth: Record<string, string>, trainerId: string, from = tomorrow()) =>
    (await http().get(`/v1/trainers/${trainerId}/slots?from=${from}&days=1`).set(auth).expect(200)).body[0].slots as Array<{ startsAt: string }>;
  const pay = (auth: Record<string, string>, reference: string) => http().post(`/v1/payments/${reference}/simulate`).set(auth).expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    gymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'legon-strength-club' } })).id;
    otherGymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'pulse-studio-airport' } })).id;
  });

  afterAll(async () => {
    const trainers = await prisma.trainer.findMany({ where: { userId: { in: users } }, select: { id: true } });
    const ids = trainers.map((t) => t.id);
    await prisma.booking.deleteMany({ where: { OR: [{ trainerId: { in: ids } }, { userId: { in: users } }] } });
    await prisma.packagePurchase.deleteMany({ where: { OR: [{ trainerId: { in: ids } }, { userId: { in: users } }] } });
    await prisma.refund.deleteMany({ where: { payment: { userId: { in: users } } } });
    await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: users } } } });
    await prisma.payment.deleteMany({ where: { userId: { in: users } } });
    await prisma.trainer.deleteMany({ where: { id: { in: ids } } });
    await prisma.trainerInvitation.deleteMany({ where: { email: { contains: run } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('lets a gym invite a trainer, who sets up and appears in the app', async () => {
    const gymOwner = await owner(gymId, 'owner1');
    const desk = await user('desk', ['member', 'gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: desk.id, role: 'front_desk' } });
    const coach = await user('coach');

    await http().post(`/v1/staff/gyms/${gymId}/trainer-invitations`).set(desk.auth).send({ email: coach.email }).expect(403);
    const invited = (await http().post(`/v1/staff/gyms/${gymId}/trainer-invitations`).set(gymOwner.auth).send({ email: coach.email.toUpperCase() }).expect(201)).body;
    expect(invited.invitations).toEqual([expect.objectContaining({ email: coach.email })]);
    expect(mail.outbox.get(coach.email)?.subject).toContain('invited you to train members');

    // The trainer dashboard needs the trainer role, which accepting adds.
    await http().get('/v1/trainer/me').set(coach.auth).expect(403);
    const someoneElse = await user('nosy');
    const [inv] = (await http().get('/v1/me/trainer-invitations').set(coach.auth).expect(200)).body;
    await http().post(`/v1/me/trainer-invitations/${inv.id}/accept`).set(someoneElse.auth).expect(404);
    await http().post(`/v1/me/trainer-invitations/${inv.id}/accept`).set(coach.auth).expect(200);
    await http().post(`/v1/me/trainer-invitations/${inv.id}/accept`).set(coach.auth).expect(404);
    const auth = await coach.refresh();

    const me = (await http().get('/v1/trainer/me').set(auth).expect(200)).body;
    expect(me).toMatchObject({ status: 'active', listed: false, gym: { id: gymId }, missing: ['profile', 'photo', 'availability', 'payout'] });
    await http().put('/v1/trainer/me/listed').set(auth).send({ listed: true }).expect(400);
    await http().put('/v1/trainer/me').set(auth).send({ bio: 'short', specialties: [], certifications: [], sessionPricePesewas: 100, sessionDurationMin: 50, cancelHours: 24 }).expect(400);
    await http().put('/v1/trainer/availability').set(auth).send({ rules: [{ weekday: 1, startTime: '06:00', endTime: '09:00' }, { weekday: 1, startTime: '08:00', endTime: '10:00' }] }).expect(400);

    // A trainer already at a gym can't be poached by another one.
    const rival = await owner(otherGymId, 'rival');
    await http().post(`/v1/staff/gyms/${otherGymId}/trainer-invitations`).set(rival.auth).send({ email: coach.email }).expect(409);

    const ready = await readyTrainer(gymId, 'listed', gymOwner);
    const member = await user('browser');
    const list = (await http().get('/v1/trainers').set(member.auth).expect(200)).body as Array<{ id: string }>;
    expect(list.map((t) => t.id)).toContain(ready.trainerId);
    expect(list.map((t) => t.id)).not.toContain(me.id); // not set up yet
    const detail = (await http().get(`/v1/trainers/${ready.trainerId}`).set(member.auth).expect(200)).body;
    expect(detail).toMatchObject({ name: 'listed Tester', sessionPricePesewas: 15000, specialties: ['Strength', 'Weight loss'], gym: { id: gymId }, photoUrl: expect.stringMatching(/^\/v1\/media\/trainers\//) });
  });

  it('books and pays for a session; the slot is taken; the trainer is paid minus BGYM’s fee', async () => {
    const gymOwner = await owner(gymId, 'owner2');
    const coach = await readyTrainer(gymId, 'paid', gymOwner);
    await prisma.trainer.update({ where: { id: coach.trainerId }, data: { platformFeeBps: 1000 } }); // 10%
    const ama = await user('ama');
    const kofi = await user('kofi');

    const [slot] = await slotsOn(ama.auth, coach.trainerId);
    await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(ama.auth).send({ startsAt: new Date(Date.parse(slot!.startsAt) + 60_000).toISOString() }).expect(409); // not an offered time
    const checkout = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(ama.auth).send({ startsAt: slot!.startsAt, note: 'Bad left knee' }).expect(201)).body;
    expect(checkout).toMatchObject({ amountPesewas: 15000, provider: 'dev', reference: expect.any(String) });
    // Held while Ama pays: Kofi can't take it.
    expect((await slotsOn(kofi.auth, coach.trainerId)).map((s) => s.startsAt)).not.toContain(slot!.startsAt);
    await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(kofi.auth).send({ startsAt: slot!.startsAt }).expect(409);

    await pay(ama.auth, checkout.reference);
    const mine = (await http().get('/v1/me/bookings').set(ama.auth).expect(200)).body;
    expect(mine[0]).toMatchObject({ id: checkout.bookingId, status: 'confirmed', paidWith: 'payment', note: 'Bad left knee', trainer: { name: 'paid Tester' } });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { reference: checkout.reference } });
    expect(payment).toMatchObject({ type: 'trainer_session', status: 'success', platformFeePesewas: 1500 });
    expect(mail.outbox.get(coach.email)?.subject).toContain('New session');
    expect((await http().get('/v1/me/payments').set(ama.auth).expect(200)).body[0].title).toBe('Personal training · paid Tester');

    // The trainer sees it, and their earnings.
    const upcoming = (await http().get('/v1/trainer/bookings').set(coach.auth).expect(200)).body;
    expect(upcoming[0]).toMatchObject({ id: checkout.bookingId, client: { name: 'ama Tester' }, paidWith: 'payment' });
    await http().post(`/v1/trainer/bookings/${checkout.bookingId}`).set(coach.auth).send({ action: 'complete' }).expect(400); // not started yet
    const earnings = (await http().get('/v1/trainer/earnings').set(coach.auth).expect(200)).body;
    expect(earnings.totals).toEqual({ payments: 1, grossPesewas: 15000, feePesewas: 1500, netPesewas: 13500 });
    // The database itself refuses an overlapping live booking.
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: checkout.bookingId } });
    await expect(prisma.booking.create({ data: { trainerId: coach.trainerId, userId: kofi.id, startsAt: new Date(b.startsAt.getTime() + 30 * 60_000), endsAt: new Date(b.endsAt.getTime() + 30 * 60_000), status: 'confirmed' } })).rejects.toThrow();
  });

  it('releases an unpaid hold after 15 minutes, and refunds a payment that arrives too late', async () => {
    const gymOwner = await owner(gymId, 'owner3');
    const coach = await readyTrainer(gymId, 'hold', gymOwner);
    const slow = await user('slow');
    const fast = await user('fast');
    const [slot] = await slotsOn(slow.auth, coach.trainerId);
    const held = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(slow.auth).send({ startsAt: slot!.startsAt }).expect(201)).body;
    await prisma.booking.update({ where: { id: held.bookingId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });

    expect((await slotsOn(fast.auth, coach.trainerId)).map((s) => s.startsAt)).toContain(slot!.startsAt);
    const taken = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(fast.auth).send({ startsAt: slot!.startsAt }).expect(201)).body;
    await pay(fast.auth, taken.reference);
    await pay(slow.auth, held.reference); // too late: the slot is Fast's now
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: held.bookingId } })).toMatchObject({ status: 'cancelled', refundDue: true });
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: held.reference } })).status).toBe('refunded');
  });

  it('sells packages; sessions booked from them; cancellations refund or return the session in time', async () => {
    const gymOwner = await owner(gymId, 'owner4');
    const coach = await readyTrainer(gymId, 'pkg', gymOwner);
    await http().post('/v1/trainer/packages').set(coach.auth).send({ name: '4 sessions a month', sessionsCount: 4, validityDays: 30, pricePesewas: 50000 }).expect(201);
    const [pkg] = (await http().get('/v1/trainer/packages').set(coach.auth).expect(200)).body;
    const efua = await user('efua');

    const bought = (await http().post(`/v1/trainer-packages/${pkg.id}/purchase`).set(efua.auth).expect(201)).body;
    expect((await http().get('/v1/me/packages').set(efua.auth).expect(200)).body).toEqual([]); // not paid yet
    await pay(efua.auth, bought.reference);
    const [mine] = (await http().get('/v1/me/packages').set(efua.auth).expect(200)).body;
    expect(mine).toMatchObject({ id: bought.packagePurchaseId, sessionsRemaining: 4, sessionsCount: 4 });
    expect((await http().get(`/v1/trainers/${coach.trainerId}`).set(efua.auth).expect(200)).body.myPackages).toHaveLength(1);

    const slots = await slotsOn(efua.auth, coach.trainerId, new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10));
    const viaPackage = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(efua.auth).send({ startsAt: slots[0]!.startsAt, packagePurchaseId: mine.id }).expect(201)).body;
    expect(viaPackage).toMatchObject({ reference: null, amountPesewas: 0 });
    expect((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: mine.id } })).sessionsRemaining).toBe(3);
    // Someone else can't use Efua's package.
    const thief = await user('thief');
    await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(thief.auth).send({ startsAt: slots[4]!.startsAt, packagePurchaseId: mine.id }).expect(400);

    // Cancelled 3 days ahead (more than 24 hours): the session goes back.
    const cancelled = (await http().post(`/v1/me/bookings/${viaPackage.bookingId}/cancel`).set(efua.auth).expect(200)).body;
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelledBy: 'member' });
    expect((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: mine.id } })).sessionsRemaining).toBe(4);
    await http().post(`/v1/me/bookings/${viaPackage.bookingId}/cancel`).set(efua.auth).expect(400);

    // A paid session cancelled late (inside 24 hours) isn't refunded.
    const [soon] = await slotsOn(efua.auth, coach.trainerId);
    const late = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(efua.auth).send({ startsAt: soon!.startsAt }).expect(201)).body;
    await pay(efua.auth, late.reference);
    await http().post(`/v1/me/bookings/${late.bookingId}/cancel`).set(efua.auth).expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: late.reference } })).status).toBe('success');

    // The trainer cancelling always refunds.
    const again = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(efua.auth).send({ startsAt: slots[2]!.startsAt }).expect(201)).body;
    await pay(efua.auth, again.reference);
    await http().post(`/v1/trainer/bookings/${again.bookingId}`).set(coach.auth).send({ action: 'cancel' }).expect(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: again.reference } })).status).toBe('refunded');
    expect(await prisma.refund.count({ where: { payment: { reference: again.reference }, status: 'processed' } })).toBe(1);
    expect(mail.outbox.get(efua.email)?.subject).toContain('Session cancelled');

    const clients = (await http().get('/v1/trainer/clients').set(coach.auth).expect(200)).body;
    expect(clients[0]).toMatchObject({ name: 'efua Tester', activePackage: { sessionsRemaining: 4 } });
  });

  it('reminds members a day and an hour before, once', async () => {
    const gymOwner = await owner(gymId, 'owner5');
    const coach = await readyTrainer(gymId, 'remind', gymOwner);
    const yaw = await user('yaw');
    await prisma.deviceToken.create({ data: { userId: yaw.id, token: `ExponentPushToken[${run}]`, platform: 'ios' } });
    const now = new Date();
    const at = new Date(now.getTime() + 23 * 60 * 60_000);
    const booking = await prisma.booking.create({ data: { trainerId: coach.trainerId, userId: yaw.id, startsAt: at, endsAt: new Date(at.getTime() + 3_600_000), status: 'confirmed', createdAt: new Date(now.getTime() - 3 * DAY) } });
    const service = app.get(BookingsService);
    const push = app.get(PushService);
    const config = (service as unknown as { config: { get: (k: string) => unknown } }).config;
    const original = config.get.bind(config);
    config.get = (k: string) => (k === 'REMINDERS_ENABLED' ? true : original(k));
    try {
      expect(await service.sendReminders(now)).toBeGreaterThanOrEqual(1);
      expect(await service.sendReminders(now)).toBe(0);
      expect(push.outbox.filter((m) => m.userId === yaw.id).map((m) => m.message.title)).toEqual(['Training tomorrow']);
      expect(mail.outbox.get(yaw.email)?.subject).toContain('Reminder: training with remind Tester');
      const hourBefore = new Date(at.getTime() - 50 * 60_000);
      await service.sendReminders(hourBefore);
      expect(push.outbox.filter((m) => m.userId === yaw.id).map((m) => m.message.title)).toHaveLength(2);
    } finally {
      config.get = original;
      await prisma.booking.delete({ where: { id: booking.id } });
      await prisma.deviceToken.deleteMany({ where: { userId: yaw.id } });
    }
  });

  it('removing a trainer unlists them and refunds their upcoming sessions', async () => {
    const gymOwner = await owner(gymId, 'owner6');
    const coach = await readyTrainer(gymId, 'leaving', gymOwner);
    const nana = await user('nana');
    const [slot] = await slotsOn(nana.auth, coach.trainerId, new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10));
    const booked = (await http().post(`/v1/trainers/${coach.trainerId}/bookings`).set(nana.auth).send({ startsAt: slot!.startsAt }).expect(201)).body;
    await pay(nana.auth, booked.reference);
    const otherOwner = await owner(otherGymId, 'owner7');
    await http().post(`/v1/staff/gyms/${otherGymId}/trainers/${coach.trainerId}/remove`).set(otherOwner.auth).expect(404);

    const after = (await http().post(`/v1/staff/gyms/${gymId}/trainers/${coach.trainerId}/remove`).set(gymOwner.auth).expect(201)).body;
    expect(after.trainers.find((t: { id: string }) => t.id === coach.trainerId)).toMatchObject({ status: 'suspended', listed: false });
    expect((await http().get('/v1/trainers').set(nana.auth).expect(200)).body.some((t: { id: string }) => t.id === coach.trainerId)).toBe(false);
    expect((await http().get('/v1/me/bookings').set(nana.auth).expect(200)).body[0]).toMatchObject({ status: 'cancelled', cancelledBy: 'system', refundDue: true });
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: booked.reference } })).status).toBe('refunded');
  });
});
