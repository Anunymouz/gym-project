import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PushService } from '../src/notifications/push.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RemindersService } from '../src/reminders/reminders.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `ntf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 86_400_000;
const NOW = new Date('2032-05-10T10:00:00Z');
const token = (n: string) => `ExponentPushToken[${run}${n}xxxxxxxxxx]`;

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let push: PushService;
  let mail: MailService;
  let gymId = '';
  let monthlyId = '';
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'gym_staff'> = ['member']) {
    const email = `${label}.${run}@example.com`;
    const u = await prisma.user.create({ data: { email, name: `${label} Tester`, roles } });
    users.push(u.id);
    const access = (await app.get(TokenService).startSession(u.id, roles, {})).accessToken;
    return { ...u, auth: { Authorization: `Bearer ${access}` } };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    push = app.get(PushService);
    mail = app.get(MailService);
    gymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'iron-haven-east-legon' } })).id;
    monthlyId = (await prisma.membershipPlan.findFirstOrThrow({ where: { gymId, name: 'Monthly' } })).id;
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 200)); // let fire-and-forget pushes finish
    await prisma.checkIn.deleteMany({ where: { OR: [{ userId: { in: users } }, { scannedById: { in: users } }] } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); // settings and devices cascade
    await app.close();
  });

  it('starts from sensible defaults and saves changes', async () => {
    const ama = await user('ama');
    const initial = await http().get('/v1/me/notifications').set(ama.auth).expect(200);
    expect(initial.body).toEqual({ renewals: { push: true, email: true }, check_ins: { push: true }, news: { push: false, email: false } });

    const res = await http().patch('/v1/me/notifications').set(ama.auth).send({ topic: 'renewals', channel: 'email', enabled: false }).expect(200);
    expect(res.body.renewals).toEqual({ push: true, email: false });
    await http().patch('/v1/me/notifications').set(ama.auth).send({ topic: 'check_ins', channel: 'email', enabled: true }).expect(400);
    await http().patch('/v1/me/notifications').set(ama.auth).send({ topic: 'everything', channel: 'push', enabled: true }).expect(400);
    await http().get('/v1/me/notifications').expect(401);
  });

  it('registers phones, moves a phone to whoever signed in last, and only lets the owner remove it', async () => {
    const kofi = await user('kofi');
    const esi = await user('esi');
    await http().put('/v1/me/devices').set(kofi.auth).send({ token: 'not-a-token', platform: 'ios' }).expect(400);
    await http().put('/v1/me/devices').set(kofi.auth).send({ token: token('a'), platform: 'ios' }).expect(204);
    await http().put('/v1/me/devices').set(esi.auth).send({ token: token('a'), platform: 'ios' }).expect(204);
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: token('a') } })).userId).toBe(esi.id);

    await http().post('/v1/me/devices/unregister').set(kofi.auth).send({ token: token('a') }).expect(204);
    expect(await prisma.deviceToken.count({ where: { token: token('a') } })).toBe(1);
    await http().post('/v1/me/devices/unregister').set(esi.auth).send({ token: token('a') }).expect(204);
    expect(await prisma.deviceToken.count({ where: { token: token('a') } })).toBe(0);
  });

  it('sends renewal reminders by push and email, following each member’s choices', async () => {
    const yaw = await user('yaw');
    await http().put('/v1/me/devices').set(yaw.auth).send({ token: token('y'), platform: 'android' }).expect(204);
    const both = await prisma.membership.create({ data: { userId: yaw.id, gymId, planId: monthlyId, startsAt: new Date(NOW.getTime() - 27 * DAY), endsAt: new Date(NOW.getTime() + 2.5 * DAY), status: 'active' } });

    const quiet = await user('quiet');
    await http().patch('/v1/me/notifications').set(quiet.auth).send({ topic: 'renewals', channel: 'email', enabled: false }).expect(200);
    const off = await prisma.membership.create({ data: { userId: quiet.id, gymId, planId: monthlyId, startsAt: new Date(NOW.getTime() - 27 * DAY), endsAt: new Date(NOW.getTime() + 2.5 * DAY), status: 'active' } });

    await app.get(RemindersService).sendDue(NOW);
    expect(push.outbox.filter((p) => p.userId === yaw.id).map((p) => p.message)).toEqual([
      expect.objectContaining({ title: 'Iron Haven Fitness: ends in 2 days', channelId: 'reminders', data: { url: '/memberships' } }),
    ]);
    expect(mail.outbox.get(yaw.email)?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(await prisma.membershipReminder.count({ where: { membershipId: both.id } })).toBe(1);
    // Email off and no phone: not reachable, so nothing is claimed or sent.
    expect(mail.outbox.has(quiet.email)).toBe(false);
    expect(await prisma.membershipReminder.count({ where: { membershipId: off.id } })).toBe(0);

    const desk = await user('desk', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: desk.id, role: 'front_desk' } });
    const res = await http().post(`/v1/staff/gyms/${gymId}/memberships/${off.id}/remind`).set(desk.auth).expect(409);
    expect(res.body.message).toBe('This member has turned off renewal reminders.');
  });

  it('turns renewal emails off from the link in the email, without signing in', async () => {
    const abena = await user('abena');
    const m = await prisma.membership.create({ data: { userId: abena.id, gymId, planId: monthlyId, startsAt: new Date(NOW.getTime() - 29 * DAY), endsAt: new Date(NOW.getTime() + 0.5 * DAY), status: 'active' } });
    await app.get(RemindersService).sendDue(NOW);
    const email = mail.outbox.get(abena.email)!;
    const link = /<(http[^>]+)>/.exec(email.headers!['List-Unsubscribe']!)![1]!;
    expect(email.text).toContain('/unsubscribe?t=');
    const t = new URL(link).searchParams.get('t')!;

    await http().post('/v1/notifications/unsubscribe').send({ token: `${t.slice(0, -4)}AAAA` }).expect(401);
    const res = await http().post('/v1/notifications/unsubscribe').send({ token: t }).expect(200);
    expect(res.body).toEqual({ topic: 'renewals', label: 'Membership renewals' });
    expect((await http().get('/v1/me/notifications').set(abena.auth).expect(200)).body.renewals).toEqual({ push: true, email: false });
    expect(m.id).toBeTruthy();
  });

  it('confirms a check-in on the member’s phone', async () => {
    const owner = await user('owner', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });
    const efua = await user('efua');
    await http().put('/v1/me/devices').set(efua.auth).send({ token: token('e'), platform: 'ios' }).expect(204);
    await prisma.membership.create({ data: { userId: efua.id, gymId, planId: monthlyId, startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 20 * DAY), status: 'active' } });

    await http().post('/v1/check-ins/by-email').set(owner.auth).send({ gymId, email: efua.email }).expect(200);
    await expect.poll(() => push.outbox.filter((p) => p.userId === efua.id).map((p) => p.message.title)).toEqual(['Checked in']);

    await http().patch('/v1/me/notifications').set(efua.auth).send({ topic: 'check_ins', channel: 'push', enabled: false }).expect(200);
    await http().post('/v1/check-ins/by-email').set(owner.auth).send({ gymId, email: efua.email }).expect(200);
    await new Promise((r) => setTimeout(r, 150));
    expect(push.outbox.filter((p) => p.userId === efua.id)).toHaveLength(1);
  });
});
