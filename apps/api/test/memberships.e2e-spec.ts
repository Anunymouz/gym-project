import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `mem${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 24 * 60 * 60 * 1000;

describe('Memberships, payments and check-in (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const users: string[] = [];
  let member = '';
  let other = '';
  let staff = '';
  let gymId = '';
  let otherGymId = '';
  let monthlyPlanId = '';

  async function signIn(email: string, roles: Array<'member' | 'gym_staff'> = ['member']): Promise<string> {
    const user = await prisma.user.create({ data: { email, name: email.split('@')[0]!, roles } });
    users.push(user.id);
    return (await app.get(TokenService).startSession(user.id, roles, {})).accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const gym = await prisma.gym.findUniqueOrThrow({ where: { slug: 'iron-haven-east-legon' }, include: { plans: true } });
    gymId = gym.id;
    monthlyPlanId = gym.plans.find((p) => p.durationDays === 30)!.id;
    otherGymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'pulse-studio-airport' } })).id;

    member = await signIn(`member.${run}@example.com`);
    other = await signIn(`other.${run}@example.com`);
    staff = await signIn(`staff.${run}@example.com`, ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: users[2]!, role: 'front_desk' } });
  });

  afterAll(async () => {
    await prisma.checkIn.deleteMany({ where: { OR: [{ scannedById: { in: users } }, { userId: { in: users } }] } });
    const memberships = await prisma.membership.findMany({ where: { userId: { in: users } }, select: { paymentId: true } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    const paymentIds = memberships.map((m) => m.paymentId).filter((x): x is string => !!x);
    await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  let reference = '';
  let membershipId = '';

  it('starts checkout with the server-side price', async () => {
    const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: monthlyPlanId } });
    const res = await http().post('/v1/memberships/checkout').set('Authorization', `Bearer ${member}`).send({ planId: monthlyPlanId, pricePesewas: 1 }).expect(201);
    expect(res.body).toMatchObject({ provider: 'dev', authorizationUrl: null, amountPesewas: plan.pricePesewas });
    reference = res.body.reference;
    membershipId = res.body.membershipId;
    const pending = await http().get(`/v1/payments/${reference}`).set('Authorization', `Bearer ${member}`).expect(200);
    expect(pending.body).toMatchObject({ status: 'pending' });
  });

  it("hides other people's payments", async () => {
    await http().get(`/v1/payments/${reference}`).set('Authorization', `Bearer ${other}`).expect(404);
    await http().post(`/v1/payments/${reference}/simulate`).set('Authorization', `Bearer ${other}`).expect(404);
  });

  it('does not issue a pass before payment', async () => {
    await http().get(`/v1/memberships/${membershipId}/pass`).set('Authorization', `Bearer ${member}`).expect(403);
  });

  it('activates the membership once paid, exactly once', async () => {
    const res = await http().post(`/v1/payments/${reference}/simulate`).set('Authorization', `Bearer ${member}`).expect(200);
    expect(res.body).toMatchObject({ status: 'success', membershipId });
    await http().post(`/v1/payments/${reference}/simulate`).set('Authorization', `Bearer ${member}`).expect(200);
    const list = await http().get('/v1/memberships').set('Authorization', `Bearer ${member}`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: membershipId, status: 'active', gym: { slug: 'iron-haven-east-legon' } });
    const days = (Date.parse(list.body[0].endsAt) - Date.parse(list.body[0].startsAt)) / DAY;
    expect(Math.round(days)).toBe(30);
  });

  it('extends from the current end date when renewing early', async () => {
    const first = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
    const res = await http().post('/v1/memberships/checkout').set('Authorization', `Bearer ${member}`).send({ planId: monthlyPlanId }).expect(201);
    await http().post(`/v1/payments/${res.body.reference}/simulate`).set('Authorization', `Bearer ${member}`).expect(200);
    const renewed = await prisma.membership.findUniqueOrThrow({ where: { id: res.body.membershipId } });
    expect(renewed.startsAt.getTime()).toBe(first.endsAt.getTime());
  });

  describe('Paystack webhook', () => {
    const sign = (body: string, secret = 'sk_test_e2e_webhook_secret') => createHmac('sha512', secret).update(body).digest('hex');
    const send = (body: string, signature: string) =>
      http().post('/v1/payments/paystack/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(body);

    let ref = '';
    let amount = 0;
    beforeAll(async () => {
      const res = await http().post('/v1/memberships/checkout').set('Authorization', `Bearer ${other}`).send({ planId: monthlyPlanId }).expect(201);
      ref = res.body.reference;
      amount = res.body.amountPesewas;
    });
    const event = (overrides: Record<string, unknown> = {}) =>
      JSON.stringify({ event: 'charge.success', data: { id: Number(`9${Date.now() % 1e8}`), reference: ref, amount, currency: 'GHS', channel: 'mobile_money', status: 'success', ...overrides } });

    it('rejects forged or unsigned events', async () => {
      const body = event();
      await send(body, sign(body, 'sk_test_wrong')).expect(401);
      await send(body, '').expect(401);
      const status = await http().get(`/v1/payments/${ref}`).set('Authorization', `Bearer ${other}`);
      expect(status.body.status).toBe('pending');
    });

    it('refuses a charge for the wrong amount', async () => {
      const body = event({ amount: 100, id: 111 });
      expect((await send(body, sign(body))).status).toBeGreaterThanOrEqual(400);
      const status = await http().get(`/v1/payments/${ref}`).set('Authorization', `Bearer ${other}`);
      expect(status.body.status).toBe('pending');
    });

    it('activates on a valid event and ignores replays', async () => {
      const body = event({ id: 222 });
      await send(body, sign(body)).expect(200);
      await send(body, sign(body)).expect(200);
      const status = await http().get(`/v1/payments/${ref}`).set('Authorization', `Bearer ${other}`).expect(200);
      expect(status.body.status).toBe('success');
      expect(await prisma.paymentEvent.count({ where: { providerEventId: 'paystack:222' } })).toBe(1);
    });
  });

  describe('QR pass and front-desk check-in', () => {
    it('checks in a valid pass', async () => {
      const pass = await http().get(`/v1/memberships/${membershipId}/pass`).set('Authorization', `Bearer ${member}`).expect(200);
      const res = await http().post('/v1/check-ins').set('Authorization', `Bearer ${staff}`).send({ gymId, token: pass.body.token }).expect(200);
      expect(res.body).toMatchObject({ result: 'ok', plan: 'Monthly', member: { name: `member.${run}` } });
    });

    it('flags a pass from another gym, and forged passes', async () => {
      const pass = await http().get(`/v1/memberships/${membershipId}/pass`).set('Authorization', `Bearer ${member}`).expect(200);
      await prisma.gymStaff.create({ data: { gymId: otherGymId, userId: users[2]!, role: 'front_desk' } });
      const wrongGym = await http().post('/v1/check-ins').set('Authorization', `Bearer ${staff}`).send({ gymId: otherGymId, token: pass.body.token }).expect(200);
      expect(wrongGym.body.result).toBe('wrong_gym');
      const forged = await http().post('/v1/check-ins').set('Authorization', `Bearer ${staff}`).send({ gymId, token: `${pass.body.token.slice(0, -4)}AAAA` }).expect(200);
      expect(forged.body).toEqual({ result: 'invalid', member: null, plan: null, endsAt: null });
    });

    it('never accepts an access token as a pass', async () => {
      const res = await http().post('/v1/check-ins').set('Authorization', `Bearer ${staff}`).send({ gymId, token: member }).expect(200);
      expect(res.body.result).toBe('invalid');
    });

    it('only lets staff of the gym check people in', async () => {
      const pass = await http().get(`/v1/memberships/${membershipId}/pass`).set('Authorization', `Bearer ${member}`).expect(200);
      await http().post('/v1/check-ins').set('Authorization', `Bearer ${other}`).send({ gymId, token: pass.body.token }).expect(403);
    });

    it("won't give a pass for someone else's membership", async () => {
      await http().get(`/v1/memberships/${membershipId}/pass`).set('Authorization', `Bearer ${other}`).expect(404);
    });
  });
});
