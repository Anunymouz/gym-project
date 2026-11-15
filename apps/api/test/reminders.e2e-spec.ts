import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RemindersService } from '../src/reminders/reminders.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `rem${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 86_400_000;
// A fixed daytime "now" far from the seeded data, so only this file's memberships are due.
const NOW = new Date('2031-03-10T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe('Renewal reminders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let reminders: RemindersService;
  let mail: MailService;
  const users: string[] = [];
  let gymId = '';
  let monthlyId = '';
  let dayPassId = '';
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'gym_staff'> = ['member']) {
    const email = `${label}.${run}@example.com`;
    const u = await prisma.user.create({ data: { email, name: `${label} Tester`, roles } });
    users.push(u.id);
    return { ...u, token: (await app.get(TokenService).startSession(u.id, roles, {})).accessToken };
  }
  const membership = (userId: string, planId: string, startsAt: Date, endsAt: Date, status: 'active' | 'expired' = 'active') =>
    prisma.membership.create({ data: { userId, gymId, planId, startsAt, endsAt, status } });
  const kinds = async (membershipId: string) =>
    (await prisma.membershipReminder.findMany({ where: { membershipId }, orderBy: { createdAt: 'asc' } })).map((r) => r.kind);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    reminders = app.get(RemindersService);
    mail = app.get(MailService);
    const gym = await prisma.gym.findUniqueOrThrow({ where: { slug: 'iron-haven-east-legon' } });
    gymId = gym.id;
    monthlyId = (await prisma.membershipPlan.findFirstOrThrow({ where: { gymId, name: 'Monthly' } })).id;
    dayPassId = (await prisma.membershipPlan.findFirstOrThrow({ where: { gymId, name: 'Day pass' } })).id;
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: { in: users } } }); // reminders cascade
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  afterEach(() => vi.restoreAllMocks());

  it('emails each stage once, as the end date approaches and passes', async () => {
    const ama = await user('ama');
    const m = await membership(ama.id, monthlyId, at(-24), at(6));

    expect((await reminders.sendDue(NOW)).sent).toBeGreaterThanOrEqual(1);
    expect(await kinds(m.id)).toEqual(['days_7']);
    const email = mail.outbox.get(ama.email)!;
    expect(email.subject).toBe('Your Iron Haven Fitness membership ends in 6 days');
    expect(email.text).toContain('Hi ama,');

    await reminders.sendDue(NOW); // nothing new
    expect(await kinds(m.id)).toEqual(['days_7']);

    await reminders.sendDue(at(4)); // 2 days left
    await reminders.sendDue(at(5.2)); // under a day left (14:48 Accra)
    await reminders.sendDue(at(6.2)); // ended
    await reminders.sendDue(at(6.3));
    expect(await kinds(m.id)).toEqual(['days_7', 'days_3', 'days_1', 'expired']);
    expect(mail.outbox.get(ama.email)!.subject).toBe('Your Iron Haven Fitness membership has ended');
  });

  it('skips day passes, members who already renewed, and night time', async () => {
    const kofi = await user('kofi');
    const pass = await membership(kofi.id, dayPassId, at(-0.5), at(0.5));
    const yaa = await user('yaa');
    const current = await membership(yaa.id, monthlyId, at(-28), at(2));
    await membership(yaa.id, monthlyId, at(2), at(32)); // renewed early
    const esi = await user('esi');
    const late = await membership(esi.id, monthlyId, at(-27), at(3));

    await reminders.sendDue(new Date('2031-03-10T22:30:00Z'));
    expect(await kinds(late.id)).toEqual([]); // quiet hours

    await reminders.sendDue(NOW);
    expect(await kinds(pass.id)).toEqual([]);
    expect(await kinds(current.id)).toEqual([]);
    expect(await kinds(late.id)).toEqual(['days_3']);
  });

  it('retries on the next run when the email fails', async () => {
    const abena = await user('abena');
    const m = await membership(abena.id, monthlyId, at(-29), at(0.5));
    vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('provider down'));
    const first = await reminders.sendDue(NOW);
    expect(first.failed).toBe(1);
    expect(await kinds(m.id)).toEqual([]);
    await reminders.sendDue(NOW);
    expect(await kinds(m.id)).toEqual(['days_1']);
  });

  it('sends exactly one reminder when two servers run at the same time', async () => {
    const kojo = await user('kojo');
    const m = await membership(kojo.id, monthlyId, at(-25), at(5));
    const send = vi.spyOn(mail, 'send');
    await Promise.all([reminders.sendDue(NOW), reminders.sendDue(NOW), reminders.sendDue(NOW)]);
    expect(await kinds(m.id)).toEqual(['days_7']);
    expect(send.mock.calls.filter(([msg]) => msg.to === kojo.email)).toHaveLength(1);
  });

  describe('from the gym dashboard', () => {
    it('lets any staff member remind once a day, and nobody else', async () => {
      const desk = await user('desk', ['gym_staff']);
      await prisma.gymStaff.create({ data: { gymId, userId: desk.id, role: 'front_desk' } });
      const outsider = await user('outsider');
      const efua = await user('efua');
      const m = await membership(efua.id, monthlyId, new Date(Date.now() - 25 * DAY), new Date(Date.now() + 5 * DAY));
      const url = `/v1/staff/gyms/${gymId}/memberships/${m.id}/remind`;

      await http().post(url).set('Authorization', `Bearer ${outsider.token}`).expect(403);
      const res = await http().post(url).set('Authorization', `Bearer ${desk.token}`).expect(200);
      expect(Date.parse(res.body.remindedAt)).toBeGreaterThan(Date.now() - 60_000);
      expect(mail.outbox.get(efua.email)!.subject).toBe('Your Iron Haven Fitness membership ends in 5 days');

      const again = await Promise.all([http().post(url).set('Authorization', `Bearer ${desk.token}`), http().post(url).set('Authorization', `Bearer ${desk.token}`)]);
      expect(again.map((r) => r.status)).toEqual([429, 429]);
      expect(await kinds(m.id)).toEqual(['manual']);

      const members = await http().get(`/v1/staff/gyms/${gymId}/members`).query({ q: efua.email }).set('Authorization', `Bearer ${desk.token}`).expect(200);
      expect(members.body[0]).toMatchObject({ membershipId: m.id, lastRemindedAt: res.body.remindedAt });
    });

    it('cannot reach another gym’s members', async () => {
      const owner = await user('owner', ['gym_staff']);
      await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });
      const other = await prisma.gym.findUniqueOrThrow({ where: { slug: 'pulse-studio-airport' }, include: { plans: { take: 1 } } });
      const ben = await user('ben');
      const elsewhere = await prisma.membership.create({ data: { userId: ben.id, gymId: other.id, planId: other.plans[0]!.id, startsAt: new Date(), endsAt: new Date(Date.now() + 3 * DAY), status: 'active' } });
      await http().post(`/v1/staff/gyms/${gymId}/memberships/${elsewhere.id}/remind`).set('Authorization', `Bearer ${owner.token}`).expect(404);
      await http().post(`/v1/staff/gyms/${other.id}/memberships/${elsewhere.id}/remind`).set('Authorization', `Bearer ${owner.token}`).expect(403);
    });
  });
});
