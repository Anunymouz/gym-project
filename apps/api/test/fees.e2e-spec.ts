import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `fee${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function makeApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false, rawBody: true });
  setupApp(app);
  await app.init();
  return app;
}

describe('Platform fees (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gymId = '';
  let planId = '';
  let originalFee: unknown;
  let originalGymFee: number | null = null;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'admin' | 'gym_staff'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }
  /** Checks out the Monthly plan (GH₵350) and returns BGYM's fee on it. */
  async function feeOnCheckout(): Promise<number> {
    const member = await user(`m${users.length}`);
    const res = await http().post('/v1/memberships/checkout').set(member.auth).send({ planId }).expect(201);
    return (await prisma.payment.findUniqueOrThrow({ where: { reference: res.body.reference } })).platformFeePesewas;
  }

  beforeAll(async () => {
    app = await makeApp();
    prisma = app.get(PrismaService);
    const gym = await prisma.gym.findUniqueOrThrow({ where: { slug: 'iron-haven-east-legon' } });
    gymId = gym.id;
    planId = (await prisma.membershipPlan.findFirstOrThrow({ where: { gymId, name: 'Monthly', isActive: true } })).id;
    originalFee = (await prisma.platformSetting.findUnique({ where: { key: 'fees.default' } }))?.value;
    originalGymFee = gym.platformFeeBps;
    // Start from a known state, whatever the database held before.
    await prisma.platformSetting.upsert({ where: { key: 'fees.default' }, create: { key: 'fees.default', value: { membershipBps: 0 } }, update: { value: { membershipBps: 0 } } });
    await prisma.gym.update({ where: { id: gymId }, data: { platformFeeBps: null } });
  });

  afterAll(async () => {
    // Put the shared settings back for the other test files and the demo.
    await prisma.platformSetting.update({ where: { key: 'fees.default' }, data: { value: (originalFee ?? { membershipBps: null }) as object } });
    await prisma.gym.update({ where: { id: gymId }, data: { platformFeeBps: originalGymFee } });
    const ms = await prisma.membership.findMany({ where: { userId: { in: users } }, select: { paymentId: true } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { id: { in: ms.flatMap((m) => (m.paymentId ? [m.paymentId] : [])) } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('lets only the BGYM team change the fee, and records who changed it', async () => {
    const admin = await user('admin', ['member', 'admin']);
    const owner = await user('owner', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });

    await http().get('/v1/admin/fees').set(owner.auth).expect(403);
    await http().put('/v1/admin/fees').set(owner.auth).send({ membershipBps: 0 }).expect(403);
    await http().put('/v1/admin/fees').set(admin.auth).send({ membershipBps: 3001 }).expect(400);
    await http().put('/v1/admin/fees').set(admin.auth).send({ membershipBps: 2.5 }).expect(400);

    const res = await http().put('/v1/admin/fees').set(admin.auth).send({ membershipBps: 250 }).expect(200);
    expect(res.body.membershipBps).toBe(250);
    expect(res.body.history[0]).toMatchObject({ by: 'admin Tester', gym: null, toBps: 250 });

    // The gym sees the fee it pays.
    expect((await http().get(`/v1/staff/gyms/${gymId}/fee`).set(owner.auth).expect(200)).body).toEqual({ bps: 250, source: 'default' });
  });

  it('charges the fee in force at checkout, with special rates per gym', async () => {
    const admin = await user('admin2', ['member', 'admin']);
    await http().put('/v1/admin/fees').set(admin.auth).send({ membershipBps: 250 }).expect(200);
    expect(await feeOnCheckout()).toBe(875); // 2.5% of GH₵350 = GH₵8.75

    await http().put(`/v1/admin/gyms/${gymId}/fee`).set(admin.auth).send({ bps: 100 }).expect(200);
    expect(await feeOnCheckout()).toBe(350); // this gym's special 1%
    expect((await http().get(`/v1/admin/gyms/${gymId}`).set(admin.auth).expect(200)).body.feeBps).toBe(100);

    await http().put(`/v1/admin/gyms/${gymId}/fee`).set(admin.auth).send({ bps: null }).expect(200);
    expect(await feeOnCheckout()).toBe(875); // back to the default

    const history = (await http().get('/v1/admin/fees').set(admin.auth).expect(200)).body.history;
    expect(history.slice(0, 2).map((h: { gym: string | null; toBps: number | null }) => [h.gym, h.toBps])).toEqual([
      ['Iron Haven Fitness', null],
      ['Iron Haven Fitness', 100],
    ]);
  });

  it('reports what BGYM earned', async () => {
    const admin = await user('admin3', ['member', 'admin']);
    const member = await user('payer');
    const checkout = await http().post('/v1/memberships/checkout').set(member.auth).send({ planId }).expect(201);
    await http().post(`/v1/payments/${checkout.body.reference}/simulate`).set(member.auth).expect(200);

    const res = (await http().get('/v1/admin/payments').set(admin.auth).expect(200)).body;
    const iron = res.byGym.find((g: { gymId: string }) => g.gymId === gymId);
    expect(iron.feePesewas).toBeGreaterThanOrEqual(875);
    expect(res.totals.gymsPesewas).toBe(res.totals.grossPesewas - res.totals.feePesewas);
    await http().get('/v1/admin/payments').set(member.auth).expect(403);
  });
});

describe('Real payments without a payout account (e2e)', () => {
  it('refuses checkout rather than collect a gym’s money in BGYM’s account', async () => {
    const app = await makeApp();
    try {
      // Switch this app to real Paystack payments (settings are read when checkout runs).
      const config = app.get(ConfigService);
      const get = config.get.bind(config);
      vi.spyOn(config, 'get').mockImplementation(((key: string, opts?: unknown) => (key === 'PAYMENTS_DRIVER' ? 'paystack' : get(key as never, opts as never))) as typeof config.get);

      const prisma = app.get(PrismaService);
      // The sample gyms have no Paystack subaccount.
      const plan = await prisma.membershipPlan.findFirstOrThrow({ where: { gym: { slug: 'pulse-studio-airport', paystackSubaccountCode: null }, isActive: true } });
      const u = await prisma.user.create({ data: { email: `nopayout.${run}@example.com`, roles: ['member'] } });
      const token = (await app.get(TokenService).startSession(u.id, ['member'], {})).accessToken;
      const res = await request(app.getHttpServer()).post('/v1/memberships/checkout').set({ Authorization: `Bearer ${token}` }).send({ planId: plan.id }).expect(409);
      expect(res.body.message).toContain('can’t take payments');
      expect(await prisma.payment.count({ where: { userId: u.id } })).toBe(0);
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
  });
});
