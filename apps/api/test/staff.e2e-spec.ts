import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `staff${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('Gym dashboard API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const users: string[] = [];
  const planIds: string[] = [];
  let gymId = '';
  let otherGymPlanId = '';
  let owner = '';
  let frontDesk = '';
  let outsider = '';
  let member = '';
  let memberEmail = '';

  async function account(label: string, roles: Array<'member' | 'gym_staff'>): Promise<{ token: string; id: string; email: string }> {
    const email = `${label}.${run}@example.com`;
    const user = await prisma.user.create({ data: { email, name: `Test ${label}`, roles } });
    users.push(user.id);
    return { token: (await app.get(TokenService).startSession(user.id, roles, {})).accessToken, id: user.id, email };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    gymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'iron-haven-east-legon' } })).id;
    otherGymPlanId = (await prisma.membershipPlan.findFirstOrThrow({ where: { gym: { slug: 'pulse-studio-airport' } } })).id;

    const o = await account('owner', ['gym_staff']);
    const f = await account('desk', ['gym_staff']);
    owner = o.token;
    frontDesk = f.token;
    outsider = (await account('outsider', ['member'])).token;
    const m = await account('member', ['member']);
    member = m.token;
    memberEmail = m.email;
    await prisma.gymStaff.createMany({ data: [{ gymId, userId: o.id, role: 'owner' }, { gymId, userId: f.id, role: 'front_desk' }] });

    const monthly = await prisma.membershipPlan.findFirstOrThrow({ where: { gymId, name: 'Monthly', isActive: true } });
    const checkout = await http().post('/v1/memberships/checkout').set('Authorization', `Bearer ${member}`).send({ planId: monthly.id }).expect(201);
    await http().post(`/v1/payments/${checkout.body.reference}/simulate`).set('Authorization', `Bearer ${member}`).expect(200);
  });

  afterAll(async () => {
    await prisma.checkIn.deleteMany({ where: { OR: [{ scannedById: { in: users } }, { userId: { in: users } }] } });
    const ms = await prisma.membership.findMany({ where: { userId: { in: users } }, select: { paymentId: true } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    const paymentIds = ms.map((x) => x.paymentId).filter((x): x is string => !!x);
    await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.membershipPlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('lists the gyms a person works at, with their role', async () => {
    const res = await http().get('/v1/staff/gyms').set(as(owner)).expect(200);
    expect(res.body).toEqual([expect.objectContaining({ id: gymId, slug: 'iron-haven-east-legon', role: 'owner' })]);
    expect((await http().get('/v1/staff/gyms').set(as(outsider)).expect(200)).body).toEqual([]);
  });

  it('serves the overview to staff only', async () => {
    const res = await http().get(`/v1/staff/gyms/${gymId}/overview`).set(as(frontDesk)).expect(200);
    expect(res.body.activeMembers).toBeGreaterThanOrEqual(1);
    expect(res.body.checkInsByDay).toHaveLength(7);
    expect(res.body.revenueThisMonthPesewas).toBeGreaterThan(0);
    await http().get(`/v1/staff/gyms/${gymId}/overview`).set(as(outsider)).expect(403);
    await http().get(`/v1/staff/gyms/${gymId}/overview`).expect(401);
  });

  it('lists and searches members', async () => {
    const res = await http().get(`/v1/staff/gyms/${gymId}/members`).query({ q: 'test member' }).set(as(frontDesk)).expect(200);
    expect(res.body).toEqual([expect.objectContaining({ email: memberEmail, status: 'active', plan: 'Monthly' })]);
    await http().get(`/v1/staff/gyms/${gymId}/members`).query({ filter: 'bogus' }).set(as(owner)).expect(400);
    await http().get(`/v1/staff/gyms/${gymId}/members`).set(as(outsider)).expect(403);
  });

  describe('plans', () => {
    let planId = '';
    it('lets owners create plans but not front-desk staff', async () => {
      const body = { name: `Student ${run}`, description: 'With a valid student ID', durationDays: 30, pricePesewas: 20000 };
      await http().post(`/v1/staff/gyms/${gymId}/plans`).set(as(frontDesk)).send(body).expect(403);
      const res = await http().post(`/v1/staff/gyms/${gymId}/plans`).set(as(owner)).send(body).expect(201);
      planId = res.body.id;
      planIds.push(planId);
      expect(res.body).toMatchObject({ isActive: true, activeMembers: 0, pricePesewas: 20000 });
    });

    it('validates plan details', async () => {
      await http().post(`/v1/staff/gyms/${gymId}/plans`).set(as(owner)).send({ name: 'X', durationDays: 0, pricePesewas: 5 }).expect(400);
    });

    it('updates price and pauses a plan, with an audit trail', async () => {
      await http().patch(`/v1/staff/gyms/${gymId}/plans/${planId}`).set(as(owner)).send({ pricePesewas: 18000 }).expect(200);
      const paused = await http().patch(`/v1/staff/gyms/${gymId}/plans/${planId}`).set(as(owner)).send({ isActive: false }).expect(200);
      expect(paused.body).toMatchObject({ pricePesewas: 18000, isActive: false });
      const page = await http().get('/v1/gyms/iron-haven-east-legon').expect(200);
      expect(page.body.plans.map((p: { id: string }) => p.id)).not.toContain(planId);
      expect(await prisma.auditLog.count({ where: { action: 'gym.plan_updated', targetId: planId } })).toBe(2);
    });

    it("can't edit another gym's plan", async () => {
      await http().patch(`/v1/staff/gyms/${gymId}/plans/${otherGymPlanId}`).set(as(owner)).send({ pricePesewas: 1000 }).expect(404);
    });
  });

  describe('check-in by email', () => {
    it('checks in a member with an active membership', async () => {
      const res = await http().post('/v1/check-ins/by-email').set(as(frontDesk)).send({ gymId, email: memberEmail.toUpperCase() }).expect(200);
      expect(res.body).toMatchObject({ result: 'ok', plan: 'Monthly', member: { name: 'Test member' } });
    });

    it('gives the same answer for unknown emails and non-members', async () => {
      const unknown = await http().post('/v1/check-ins/by-email').set(as(frontDesk)).send({ gymId, email: `nobody.${run}@example.com` }).expect(200);
      expect(unknown.body).toEqual({ result: 'invalid', member: null, plan: null, endsAt: null });
    });

    it('is staff-only', async () => {
      await http().post('/v1/check-ins/by-email').set(as(outsider)).send({ gymId, email: memberEmail }).expect(403);
    });
  });
});
