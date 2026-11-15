import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `rcp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('Receipts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles: ['member'] } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, ['member'], {})).accessToken}` } };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    const ms = await prisma.membership.findMany({ where: { userId: { in: users } }, select: { paymentId: true } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    const ids = ms.flatMap((m) => (m.paymentId ? [m.paymentId] : []));
    await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { id: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('emails one receipt per payment and lists it for the payer only', async () => {
    const ama = await user('ama');
    const other = await user('other');
    const plan = await prisma.membershipPlan.findFirstOrThrow({ where: { gym: { slug: 'iron-haven-east-legon' }, name: 'Monthly', isActive: true } });
    const checkout = await http().post('/v1/memberships/checkout').set(ama.auth).send({ planId: plan.id }).expect(201);
    await http().post(`/v1/payments/${checkout.body.reference}/simulate`).set(ama.auth).expect(200);

    const receipts = () => mail.sent.filter((m) => m.to === ama.email && m.subject.startsWith('Receipt '));
    expect(receipts()).toHaveLength(1);
    const email = receipts()[0]!;
    expect(email.subject).toMatch(/^Receipt BGYM-[0-9A-F]{8}: Monthly · Iron Haven Fitness \(GH₵\s?350\)$/);
    expect(email.text).toContain('Paid with: Mobile money');

    // The same confirmation arriving again (e.g. a repeated webhook) sends nothing new.
    await app.get(PaymentsService).recordSuccess({ reference: checkout.body.reference, providerEventId: `again-${run}`, eventType: 'charge.success', payload: {}, amountPesewas: plan.pricePesewas, currency: 'GHS', channel: 'mobile_money' });
    expect(receipts()).toHaveLength(1);

    const list = (await http().get('/v1/me/payments').set(ama.auth).expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ title: 'Monthly · Iron Haven Fitness', amountPesewas: plan.pricePesewas, channel: 'mobile_money' })]);
    const detail = (await http().get(`/v1/me/payments/${list[0].id}`).set(ama.auth).expect(200)).body;
    expect(detail).toMatchObject({ number: list[0].number, member: { email: ama.email }, gym: { name: 'Iron Haven Fitness' }, plan: 'Monthly', period: { startsAt: expect.any(String), endsAt: expect.any(String) } });

    await http().get(`/v1/me/payments/${list[0].id}`).set(other.auth).expect(404);
    expect((await http().get('/v1/me/payments').set(other.auth).expect(200)).body).toEqual([]);
  });
});
