import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { RefundsService } from '../src/payments/refunds.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `cat${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('Store catalogue, partners and review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  let categoryId = '';
  let photo: Buffer;
  const users: string[] = [];
  const sellers: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'admin' | 'partner'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }
  async function signInAs(email: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, u.roles, {})).accessToken}` } };
  }
  const product = (sku: string, extra: Record<string, unknown> = {}) => ({
    title: `Whey Protein ${run}`,
    brand: 'MuscleCo',
    description: 'Fast-digesting whey for recovery.',
    categoryId,
    variants: [
      { name: '1 kg · Chocolate', sku: `${sku}-1KG`, pricePesewas: 45000, compareAtPricePesewas: 52000, stock: 10 },
      { name: '2 kg · Vanilla', sku: `${sku}-2KG`, pricePesewas: 80000, stock: 0 },
    ],
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    categoryId = (await prisma.category.findFirstOrThrow({ where: { slug: 'supplements' } })).id;
    photo = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#ff5a1f' } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    const platform = await prisma.seller.findFirst({ where: { type: 'platform' } });
    await prisma.product.deleteMany({ where: { OR: [{ sellerId: { in: sellers } }, { sellerId: platform?.id, title: { contains: run } }] } });
    await prisma.pickupLocation.deleteMany({ where: { sellerId: { in: sellers } } });
    await prisma.partnerUser.deleteMany({ where: { sellerId: { in: sellers } } });
    await prisma.seller.deleteMany({ where: { id: { in: sellers } } });
    await prisma.refund.deleteMany({ where: { payment: { userId: { in: users } } } });
    await prisma.payment.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('lets the BGYM team set up a partner, who lists products that go live after review', async () => {
    const admin = await user('admin', ['member', 'admin']);
    const member = await user('member');
    const partnerEmail = `partner.${run}@example.com`;
    const body = { name: `Accra Nutrition ${run}`, contactEmail: partnerEmail, contactPhone: '024 123 4567', commissionBps: 1500 };
    await http().post('/v1/admin/store/partners').set(member.auth).send(body).expect(403);
    const created = (await http().post('/v1/admin/store/partners').set(admin.auth).send(body).expect(201)).body;
    sellers.push(created.id);
    expect(created).toMatchObject({ type: 'partner', commissionBps: 1500, contactPhone: '+233241234567', payoutConnected: false, users: [{ email: partnerEmail }] });
    expect(mail.outbox.get(partnerEmail)?.subject).toContain('is set up on the BGYM Store');

    const partner = await signInAs(partnerEmail);
    expect(partner.roles).toContain('partner');
    await http().get('/v1/partner/me').set(member.auth).expect(403);
    await http().put('/v1/partner/pickup').set(partner.auth).send({ addressText: 'Spintex Road warehouse', latitude: 5.6342, longitude: -0.1012, contactPhone: '0201234567' }).expect(200);
    expect((await http().get('/v1/partner/me').set(partner.auth).expect(200)).body.pickup).toMatchObject({ addressText: 'Spintex Road warehouse', latitude: 5.6342, longitude: -0.1012 });

    // Draft → needs a photo → sent for review (partners can't go live by themselves).
    await http().post('/v1/partner/products').set(partner.auth).send({ ...product('X'), variants: [] }).expect(400);
    const p = (await http().post('/v1/partner/products').set(partner.auth).send(product(`${run}A`)).expect(201)).body;
    expect(p).toMatchObject({ status: 'draft', variants: [{ sku: `${run.toUpperCase()}A-1KG`, stock: 10 }, { name: '2 kg · Vanilla' }] });
    await http().post('/v1/partner/products').set(partner.auth).send(product(`${run}A`)).expect(409); // same SKUs
    await http().post(`/v1/partner/products/${p.id}/status`).set(partner.auth).send({ action: 'publish' }).expect(400);
    await http().post(`/v1/partner/products/${p.id}/photos`).set(partner.auth).attach('photo', photo, 'p.jpg').expect(201);
    expect((await http().post(`/v1/partner/products/${p.id}/status`).set(partner.auth).send({ action: 'publish' }).expect(200)).body.status).toBe('pending_review');
    await http().get(`/v1/store/products/${p.id}`).set(member.auth).expect(404);

    // Sent back with a note, fixed, approved.
    await http().post(`/v1/admin/store/review/${p.id}`).set(admin.auth).send({ decision: 'reject', note: 'Add the nutrition facts.' }).expect(204);
    expect((await http().get(`/v1/partner/products/${p.id}`).set(partner.auth).expect(200)).body).toMatchObject({ status: 'draft', reviewNote: 'Add the nutrition facts.' });
    await http().post(`/v1/partner/products/${p.id}/status`).set(partner.auth).send({ action: 'publish' }).expect(200);
    expect((await http().get('/v1/admin/store/review').set(admin.auth).expect(200)).body.some((x: { id: string }) => x.id === p.id)).toBe(true);
    await http().post(`/v1/admin/store/review/${p.id}`).set(admin.auth).send({ decision: 'approve' }).expect(204);

    const detail = (await http().get(`/v1/store/products/${p.id}`).set(member.auth).expect(200)).body;
    expect(detail).toMatchObject({ title: `Whey Protein ${run}`, seller: body.name, pricePesewas: 45000, compareAtPricePesewas: 52000, inStock: true, variants: [{ available: 10 }, { available: 0 }] });
    expect(detail.images[0].url).toMatch(/^\/v1\/media\/products\//);
    const found = (await http().get(`/v1/store/products?q=${encodeURIComponent(`protein ${run}`)}`).set(member.auth).expect(200)).body.products;
    expect(found.map((x: { id: string }) => x.id)).toEqual([p.id]);
    expect((await http().get('/v1/store/products?category=apparel').set(member.auth).expect(200)).body.products.some((x: { id: string }) => x.id === p.id)).toBe(false);

    // Changing a live product's details sends it back for review; dropped options are switched off.
    const [first] = detail.variants;
    const edited = (await http().put(`/v1/partner/products/${p.id}`).set(partner.auth).send({ ...product(`${run}A`), title: `Whey Protein Isolate ${run}`, variants: [{ id: first.id, name: '1 kg · Chocolate', sku: `${run}A-1KG`, pricePesewas: 44000, stock: 12 }] }).expect(200)).body;
    expect(edited.status).toBe('pending_review');
    expect(edited.variants.find((v: { isActive: boolean }) => !v.isActive)?.name).toBe('2 kg · Vanilla');

    // Another partner can't touch it; pausing the partner hides everything.
    const other = await user('other', ['member', 'partner']);
    await http().get(`/v1/partner/products/${p.id}`).set(other.auth).expect(403);
    await http().post(`/v1/admin/store/review/${p.id}`).set(admin.auth).send({ decision: 'approve' }).expect(204);
    await http().patch(`/v1/admin/store/partners/${created.id}`).set(admin.auth).send({ isActive: false }).expect(200);
    await http().get(`/v1/store/products/${p.id}`).set(member.auth).expect(404);
  });

  it('puts BGYM’s own products live straight away', async () => {
    const admin = await user('admin2', ['member', 'admin']);
    const member = await user('shopper');
    const own = (await http().post('/v1/admin/store/own/products').set(admin.auth).send(product(`${run}B`, { title: `BGYM Shaker ${run}` })).expect(201)).body;
    await http().post(`/v1/admin/store/own/products/${own.id}/photos`).set(admin.auth).attach('photo', photo, 's.jpg').expect(201);
    expect((await http().post(`/v1/admin/store/own/products/${own.id}/status`).set(admin.auth).send({ action: 'publish' }).expect(200)).body.status).toBe('active');
    expect((await http().get(`/v1/store/products/${own.id}`).set(member.auth).expect(200)).body.seller).toBe('BGYM Store');
    await http().post(`/v1/admin/store/own/products/${own.id}/status`).set(admin.auth).send({ action: 'archive' }).expect(200);
    await http().get(`/v1/store/products/${own.id}`).set(member.auth).expect(404);
  });

  it('marks refunds complete (or failed) when Paystack says so', async () => {
    const payer = await user('payer');
    const payment = await prisma.payment.create({ data: { userId: payer.id, type: 'store_order', amountPesewas: 5000, provider: 'paystack', reference: `bgym_${run}`, status: 'refunded' } });
    await prisma.refund.create({ data: { paymentId: payment.id, amountPesewas: 5000, reason: 'test', status: 'pending', initiatedById: payer.id } });
    await app.get(RefundsService).onProviderUpdate(`bgym_${run}`, 'processed');
    expect(await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } })).toMatchObject({ status: 'processed', processedAt: expect.any(Date) });
    await app.get(RefundsService).onProviderUpdate(`bgym_${run}`, 'failed'); // already processed: ignored
    expect((await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } })).status).toBe('processed');
  });
});
