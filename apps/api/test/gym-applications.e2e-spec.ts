import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from '../src/common/client-ip.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `app${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('Gym applications and review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'admin' | 'gym_staff'> = ['member']) {
    const email = `${label}.${run}@example.com`;
    const u = await prisma.user.create({ data: { email, name: `${label} Tester`, roles } });
    users.push(u.id);
    // Each person gets their own IP (passed on as the dashboard server does), so per-IP limits apply per person.
    const ip = `198.51.100.${users.length}`;
    const auth = { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}`, [PROXY_SECRET_HEADER]: 'test-dashboard-proxy-secret-0123456789abcdef', [CLIENT_IP_HEADER]: ip };
    return { ...u, auth };
  }
  const application = (n = '') => ({ name: `Test Gym ${run}${n}`, addressText: 'Spintex, Accra', phone: '0244 000 111', location: { lat: 5.6312, lng: -0.1009 } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    const ms = await prisma.membership.findMany({ where: { userId: { in: users } }, select: { paymentId: true } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { id: { in: ms.flatMap((m) => (m.paymentId ? [m.paymentId] : [])) } } });
    const gyms = await prisma.gym.findMany({ where: { staff: { some: { userId: { in: users } } } }, select: { id: true } });
    await prisma.gym.deleteMany({ where: { id: { in: gyms.map((g) => g.id) } } }); // plans and staff cascade
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('takes a gym from application to live, with the BGYM team’s review', async () => {
    const owner = await user('owner');
    const admin = await user('admin', ['member', 'admin']);

    await http().post('/v1/gyms/applications').set(owner.auth).send({ ...application(), location: { lat: 51.5, lng: -0.12 } }).expect(400); // London
    const created = await http().post('/v1/gyms/applications').set(owner.auth).send(application()).expect(201);
    const gymId: string = created.body.id;
    expect(created.body.slug).toMatch(/^test-gym-.*-spintex$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).roles).toContain('gym_staff');

    // Draft gyms are invisible to members and can't sell memberships.
    await http().get(`/v1/gyms/${created.body.slug}`).expect(404);
    const mine = await http().get('/v1/staff/gyms').set(owner.auth).expect(200);
    expect(mine.body).toEqual([expect.objectContaining({ id: gymId, role: 'owner', status: 'draft' })]);

    const base = `/v1/staff/gyms/${gymId}`;
    let ready = (await http().get(`${base}/readiness`).set(owner.auth).expect(200)).body;
    expect(ready).toMatchObject({ status: 'draft', canSubmit: false, steps: { profile: false, hours: false, plans: false, payout: false } });
    await http().post(`${base}/submit`).set(owner.auth).expect(400);

    // Fill in the checklist.
    const profile = (await http().get(`${base}/profile`).set(owner.auth).expect(200)).body;
    const day = [{ open: '06:00', close: '21:00' }];
    await http()
      .patch(`${base}/profile`)
      .set(owner.auth)
      .send({ name: profile.name, addressText: profile.addressText, phone: profile.phone, email: null, facilities: ['AC'], description: 'A friendly neighbourhood gym in Spintex with free weights.', openingHours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: [], sun: [] } })
      .expect(200);
    const plan = await http().post(`${base}/plans`).set(owner.auth).send({ name: 'Monthly', durationDays: 30, pricePesewas: 30000 }).expect(201);
    await prisma.gym.update({ where: { id: gymId }, data: { paystackSubaccountCode: `ACCT_${run}` } }); // payout step: own tests
    ready = (await http().get(`${base}/readiness`).set(owner.auth).expect(200)).body;
    expect(ready.canSubmit).toBe(true);

    // Checkout is refused until the gym is live.
    const member = await user('member');
    await http().post('/v1/memberships/checkout').set(member.auth).send({ planId: plan.body.id }).expect(404);

    await http().post(`${base}/submit`).set(owner.auth).expect(200);
    expect(mail.outbox.get(admin.email)?.subject).toContain('New gym to review');
    await http().post(`${base}/submit`).set(owner.auth).expect(409);

    // Members can't use the admin API.
    await http().get('/v1/admin/gyms').set(owner.auth).expect(403);
    const queue = (await http().get('/v1/admin/gyms').query({ status: 'pending_review' }).set(admin.auth).expect(200)).body;
    expect(queue).toEqual(expect.arrayContaining([expect.objectContaining({ id: gymId, owner: { name: 'owner Tester', email: owner.email }, payoutReady: true, location: { lat: 5.6312, lng: -0.1009 } })]));

    // Sent back with a note, fixed, resubmitted, approved.
    await http().post(`/v1/admin/gyms/${gymId}/review`).set(admin.auth).send({ decision: 'return' }).expect(400); // note required
    await http().post(`/v1/admin/gyms/${gymId}/review`).set(admin.auth).send({ decision: 'return', note: 'Please add a photo of the gym floor.' }).expect(200);
    ready = (await http().get(`${base}/readiness`).set(owner.auth).expect(200)).body;
    expect(ready).toMatchObject({ status: 'draft', reviewNote: 'Please add a photo of the gym floor.' });
    expect(mail.outbox.get(owner.email)?.text).toContain('Please add a photo of the gym floor.');

    await http().post(`${base}/submit`).set(owner.auth).expect(200);
    const [a, b] = await Promise.all([
      http().post(`/v1/admin/gyms/${gymId}/review`).set(admin.auth).send({ decision: 'approve' }),
      http().post(`/v1/admin/gyms/${gymId}/review`).set(admin.auth).send({ decision: 'approve' }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]); // decided exactly once
    expect(mail.outbox.get(owner.email)?.subject).toContain('is live on BGYM');
    await http().get(`/v1/gyms/${created.body.slug}`).expect(200);
    await http().post('/v1/memberships/checkout').set(member.auth).send({ planId: plan.body.id }).expect(201);

    // Pause and reactivate.
    await http().post(`/v1/admin/gyms/${gymId}/suspend`).set(admin.auth).send({ reason: 'Payout account under review' }).expect(200);
    await http().get(`/v1/gyms/${created.body.slug}`).expect(404);
    await http().post(`/v1/admin/gyms/${gymId}/reactivate`).set(admin.auth).expect(200);
    await http().get(`/v1/gyms/${created.body.slug}`).expect(200);

    const actions = (await prisma.auditLog.findMany({ where: { targetId: gymId }, orderBy: { createdAt: 'asc' } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['gym.applied', 'gym.submitted', 'gym.returned', 'gym.approved', 'gym.suspended', 'gym.reactivated']));
  });

  it('removes admin access immediately when the role is taken away', async () => {
    const admin = await user('exadmin', ['member', 'admin']);
    await http().get('/v1/admin/gyms').set(admin.auth).expect(200);
    await prisma.user.update({ where: { id: admin.id }, data: { roles: ['member'] } });
    await http().get('/v1/admin/gyms').set(admin.auth).expect(403); // same, still-valid token
  });

  it('limits how many gyms one person can have in progress', async () => {
    const busy = await user('busy');
    for (const n of ['a', 'b', 'c']) await http().post('/v1/gyms/applications').set(busy.auth).send(application(n)).expect(201);
    // The fourth is refused by the in-progress limit, not the hourly rate limit (4 < 5).
    const res = await http().post('/v1/gyms/applications').set(busy.auth).send(application('d')).expect(409);
    expect(res.body.message).toContain('Finish setting up');
  });

  describe('payout account', () => {
    const codeIn = (to: string, subject: RegExp) => {
      const msg = [...mail.sent].reverse().find((m) => m.to === to && subject.test(m.subject));
      return msg ? /\b(\d{6})\b/.exec(msg.subject)![1]! : null;
    };

    it('needs the owner and a fresh code from their email, and stores only a masked copy', async () => {
      const owner = await user('payowner');
      const gymId: string = (await http().post('/v1/gyms/applications').set(owner.auth).send(application('pay')).expect(201)).body.id;
      const desk = await user('paydesk', ['member', 'gym_staff']);
      await prisma.gymStaff.create({ data: { gymId, userId: desk.id, role: 'manager' } });
      const base = `/v1/staff/gyms/${gymId}/payout`;

      const banks = (await http().get('/v1/payouts/banks').set(owner.auth).expect(200)).body;
      expect(banks).toEqual(expect.arrayContaining([{ code: 'MTN', name: 'MTN Mobile Money', method: 'mobile_money' }]));
      expect((await http().get(base).set(owner.auth).expect(200)).body).toMatchObject({ connected: false });
      await http().get(base).set(desk.auth).expect(403); // managers never see payout details
      await http().post(`${base}/code`).set(desk.auth).expect(403);

      const account = { bankCode: '040100', accountNumber: '1441 0000 5678 9012', accountName: 'Pay Test Gym Ltd' };
      await http().put(base).set(owner.auth).send({ ...account, code: '000000' }).expect(401);

      // A sign-in code can't confirm a payout change...
      await http().post('/v1/auth/email/request').set(owner.auth).send({ email: owner.email }).expect(202);
      const signInCode = codeIn(owner.email, /sign-in code/)!;
      await http().put(base).set(owner.auth).send({ ...account, code: signInCode }).expect(401);

      await http().post(`${base}/code`).set(owner.auth).expect(202);
      const payoutCode = codeIn(owner.email, /confirms your payout account change/)!;
      expect(payoutCode).toMatch(/^\d{6}$/);
      // ...and a payout code can't sign anyone in.
      await http().post('/v1/auth/email/verify').send({ email: owner.email, code: payoutCode }).expect(401);

      // Mobile money numbers must look like a Ghana phone number.
      await http().put(base).set(owner.auth).send({ bankCode: 'MTN', accountNumber: '12345678', accountName: 'X Y', code: payoutCode }).expect(400);
      const saved = (await http().put(base).set(owner.auth).send({ ...account, code: payoutCode }).expect(200)).body;
      expect(saved).toMatchObject({ connected: true, method: 'bank', bankName: 'GCB Bank', accountName: 'Pay Test Gym Ltd', accountLast4: '9012' });
      // The code is single-use.
      await http().put(base).set(owner.auth).send({ ...account, code: payoutCode }).expect(401);

      const row = await prisma.gym.findUniqueOrThrow({ where: { id: gymId } });
      expect(JSON.stringify(row)).not.toContain('1441000056789012');
      expect(row.paystackSubaccountCode).toMatch(/^ACCT_dev_/);
      expect(mail.sent.some((m) => m.to === owner.email && m.subject.includes('payout account changed') && m.text.includes('ending 9012'))).toBe(true);
      expect((await http().get(`/v1/staff/gyms/${gymId}/readiness`).set(owner.auth).expect(200)).body.steps.payout).toBe(true);
      expect(await prisma.auditLog.count({ where: { targetId: gymId, action: 'gym.payout_added' } })).toBe(1);
    });
  });
});
