import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { CheckoutService } from '../src/store/checkout.service.js';

const run = `ord${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const EAST_LEGON = { latitude: 5.6357, longitude: -0.1573 };

describe('Store cart, checkout and orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  let admin: { id: string; auth: Record<string, string> };
  let partner: { id: string; email: string; auth: Record<string, string> };
  let partnerSellerId = '';
  let platformVariant = '';
  let partnerVariant = '';
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'admin' | 'partner'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }
  async function liveProduct(base: string, auth: Record<string, string>, sku: string, price: number, stock: number, title: string) {
    const photo = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#16a34a' } }).jpeg().toBuffer();
    const categoryId = (await prisma.category.findFirstOrThrow({ where: { slug: 'supplements' } })).id;
    const p = (await http().post(`${base}/products`).set(auth).send({ title, categoryId, variants: [{ name: 'Standard', sku, pricePesewas: price, stock }] }).expect(201)).body;
    await http().post(`${base}/products/${p.id}/photos`).set(auth).attach('photo', photo, 'p.jpg').expect(201);
    await http().post(`${base}/products/${p.id}/status`).set(auth).send({ action: 'publish' }).expect(200);
    return p as { id: string; variants: Array<{ id: string }> };
  }
  async function shopper(label: string) {
    const m = await user(label);
    const [address] = (await http().post('/v1/me/addresses').set(m.auth).send({ ...EAST_LEGON, addressText: 'House 12, Lagos Avenue, East Legon', landmark: 'Opposite the pharmacy', contactPhone: '0244000111' }).expect(201)).body;
    return { ...m, addressId: address.id as string };
  }
  const pay = (auth: Record<string, string>, reference: string) => http().post(`/v1/payments/${reference}/simulate`).set(auth).expect(200);
  const stockOf = async (variantId: string) => prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stock: true, reserved: true } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);

    admin = await user('admin', ['member', 'admin']);
    await http().put('/v1/admin/store/own/pickup').set(admin.auth).send({ addressText: 'BGYM warehouse, Spintex', latitude: 5.6342, longitude: -0.1012, contactPhone: '0302000000' }).expect(200);
    const own = await liveProduct('/v1/admin/store/own', admin.auth, `${run}-SHAKER`, 5000, 3, `BGYM Shaker ${run}`);
    platformVariant = own.variants[0]!.id;

    const partnerEmail = `partner.${run}@example.com`;
    partnerSellerId = (await http().post('/v1/admin/store/partners').set(admin.auth).send({ name: `Accra Nutrition ${run}`, contactEmail: partnerEmail, contactPhone: '0201234567', commissionBps: 1000 }).expect(201)).body.id;
    const pu = await prisma.user.findUniqueOrThrow({ where: { email: partnerEmail } });
    users.push(pu.id);
    partner = { id: pu.id, email: partnerEmail, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(pu.id, pu.roles, {})).accessToken}` } };
    await http().put('/v1/partner/pickup').set(partner.auth).send({ addressText: 'Osu warehouse', latitude: 5.5571, longitude: -0.182, contactPhone: '0201234567' }).expect(200);
    await prisma.seller.update({ where: { id: partnerSellerId }, data: { paystackSubaccountCode: `ACCT_dev_${run}` } });
    const whey = await liveProduct('/v1/partner', partner.auth, `${run}-WHEY`, 40000, 5, `Whey ${run}`);
    await http().post(`/v1/admin/store/review/${whey.id}`).set(admin.auth).send({ decision: 'approve' }).expect(204);
    partnerVariant = whey.variants[0]!.id;
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({ where: { userId: { in: users } }, select: { id: true } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.refund.deleteMany({ where: { payment: { userId: { in: users } } } });
    await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: users } } } });
    await prisma.payment.deleteMany({ where: { userId: { in: users } } });
    await prisma.cartItem.deleteMany({ where: { userId: { in: users } } });
    await prisma.address.deleteMany({ where: { userId: { in: users } } });
    await prisma.product.deleteMany({ where: { title: { contains: run } } });
    await prisma.pickupLocation.deleteMany({ where: { sellerId: partnerSellerId } });
    await prisma.partnerUser.deleteMany({ where: { sellerId: partnerSellerId } });
    await prisma.seller.deleteMany({ where: { id: partnerSellerId } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('checks out a cart from two sellers: one payment, two orders, stock held then taken', async () => {
    const ama = await shopper('ama');
    await http().put('/v1/me/cart').set(ama.auth).send({ variantId: platformVariant, quantity: 4 }).expect(400); // only 3 in stock
    await http().put('/v1/me/cart').set(ama.auth).send({ variantId: platformVariant, quantity: 2 }).expect(200);
    const cart = (await http().put('/v1/me/cart').set(ama.auth).send({ variantId: partnerVariant, quantity: 1 }).expect(200)).body;
    expect(cart).toMatchObject({ count: 3, subtotalPesewas: 2 * 5000 + 40000 });

    const quote = (await http().post('/v1/me/checkout/quote').set(ama.auth).send({ addressId: ama.addressId }).expect(200)).body;
    expect(quote.problem).toBeNull();
    expect(quote.orders).toHaveLength(2);
    expect(quote.deliveryPesewas).toBeGreaterThan(0);
    expect(quote.totalPesewas).toBe(quote.subtotalPesewas + quote.deliveryPesewas);

    // Too far: Kumasi is ~200 km away.
    const [far] = (await http().post('/v1/me/addresses').set(ama.auth).send({ latitude: 6.6885, longitude: -1.6244, addressText: 'Adum, Kumasi', contactPhone: '0244000111' }).expect(201)).body;
    expect((await http().post('/v1/me/checkout/quote').set(ama.auth).send({ addressId: far.id }).expect(200)).body.problem).toMatch(/doesn’t deliver that far/);
    await http().post('/v1/me/checkout').set(ama.auth).send({ addressId: far.id }).expect(400);

    const checkout = (await http().post('/v1/me/checkout').set(ama.auth).send({ addressId: ama.addressId, note: 'Call when outside' }).expect(201)).body;
    expect(checkout).toMatchObject({ amountPesewas: quote.totalPesewas, provider: 'dev', orderIds: [expect.any(String), expect.any(String)] });
    expect(await stockOf(platformVariant)).toEqual({ stock: 3, reserved: 2 });

    // Held stock can't be sold to someone else.
    const kofi = await shopper('kofi');
    await http().put('/v1/me/cart').set(kofi.auth).send({ variantId: platformVariant, quantity: 2 }).expect(400);

    await pay(ama.auth, checkout.reference);
    expect(await stockOf(platformVariant)).toEqual({ stock: 1, reserved: 0 });
    expect(await stockOf(partnerVariant)).toEqual({ stock: 4, reserved: 0 });
    expect((await http().get('/v1/me/cart').set(ama.auth).expect(200)).body.lines).toEqual([]);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { reference: checkout.reference } });
    // BGYM keeps everything except the partner's items minus 10% commission.
    expect(payment.platformFeePesewas).toBe(quote.totalPesewas - (40000 - 4000));
    const orders = (await http().get('/v1/me/orders').set(ama.auth).expect(200)).body;
    expect(orders.map((o: { status: string }) => o.status)).toEqual(['paid', 'paid']);
    expect(orders[0].number).toMatch(/^BG-\d+$/);
    expect(mail.outbox.get(partner.email)?.subject).toMatch(/^New order BG-/);
    const receipt = (await http().get('/v1/me/payments').set(ama.auth).expect(200)).body[0];
    expect(receipt.title).toMatch(/^BGYM Store · BG-\d+, BG-\d+$/);
  });

  it('lets sellers move orders along, and refunds a cancelled order (just that order)', async () => {
    const efua = await shopper('efua');
    await http().put('/v1/me/cart').set(efua.auth).send({ variantId: partnerVariant, quantity: 1 }).expect(200);
    await http().put('/v1/me/cart').set(efua.auth).send({ variantId: platformVariant, quantity: 1 }).expect(200);
    const checkout = (await http().post('/v1/me/checkout').set(efua.auth).send({ addressId: efua.addressId }).expect(201)).body;
    await pay(efua.auth, checkout.reference);
    const orders = (await http().get('/v1/me/orders').set(efua.auth).expect(200)).body as Array<{ id: string; seller: string; totalPesewas: number }>;
    const partnerOrder = orders.find((o) => o.seller.startsWith('Accra Nutrition'))!;
    const ownOrder = orders.find((o) => o.seller === 'BGYM Store')!;

    // The partner sees only their order, and moves it along.
    const open = (await http().get('/v1/partner/orders').set(partner.auth).expect(200)).body as Array<{ id: string; customer: { phone: string }; commissionPesewas: number }>;
    expect(open.some((o) => o.id === ownOrder.id)).toBe(false);
    expect(open.find((o) => o.id === partnerOrder.id)).toMatchObject({ customer: { phone: '+233244000111' }, commissionPesewas: 4000 });
    await http().post(`/v1/partner/orders/${ownOrder.id}`).set(partner.auth).send({ action: 'preparing' }).expect(404);
    await http().post(`/v1/partner/orders/${partnerOrder.id}`).set(partner.auth).send({ action: 'delivered' }).expect(400); // not out yet
    await http().post(`/v1/partner/orders/${partnerOrder.id}`).set(partner.auth).send({ action: 'preparing' }).expect(200);
    await http().post(`/v1/partner/orders/${partnerOrder.id}`).set(partner.auth).send({ action: 'ready' }).expect(200);
    await http().post(`/v1/partner/orders/${partnerOrder.id}`).set(partner.auth).send({ action: 'dispatch', courierName: 'Kwesi', courierPhone: '0551234567' }).expect(200);
    await http().post(`/v1/me/orders/${partnerOrder.id}/cancel`).set(efua.auth).expect(400); // on its way: too late
    const done = (await http().post(`/v1/partner/orders/${partnerOrder.id}`).set(partner.auth).send({ action: 'delivered' }).expect(200)).body;
    expect(done.events.map((e: { status: string }) => e.status)).toEqual(['pending_payment', 'paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered']);
    const tracked = (await http().get(`/v1/me/orders/${partnerOrder.id}`).set(efua.auth).expect(200)).body;
    expect(tracked).toMatchObject({ status: 'delivered', delivery: { courierName: 'Kwesi', courierPhone: '+233551234567' } });

    // Efua cancels the other order before it's prepared: that order is refunded, the stock returns.
    const before = await stockOf(platformVariant);
    expect((await http().post(`/v1/me/orders/${ownOrder.id}/cancel`).set(efua.auth).expect(200)).body).toMatchObject({ status: 'cancelled', refundDue: true });
    expect(await stockOf(platformVariant)).toEqual({ stock: before.stock + 1, reserved: 0 });
    const refunds = await prisma.refund.findMany({ where: { payment: { reference: checkout.reference } } });
    expect(refunds.map((r) => r.amountPesewas)).toEqual([ownOrder.totalPesewas]);
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: checkout.reference } })).status).toBe('success'); // partly refunded
    await http().post(`/v1/me/orders/${ownOrder.id}/cancel`).set(efua.auth).expect(400); // once
  });

  it('gives stock back when payment isn’t made in time, and refunds a payment that comes too late', async () => {
    const slow = await shopper('slow');
    await http().put('/v1/me/cart').set(slow.auth).send({ variantId: partnerVariant, quantity: 1 }).expect(200);
    const checkout = (await http().post('/v1/me/checkout').set(slow.auth).send({ addressId: slow.addressId }).expect(201)).body;
    const held = await stockOf(partnerVariant);
    await prisma.order.updateMany({ where: { id: { in: checkout.orderIds } }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    expect(await app.get(CheckoutService).expireHolds()).toBeGreaterThanOrEqual(1);
    expect((await stockOf(partnerVariant)).reserved).toBe(held.reserved - 1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderIds[0] } })).status).toBe('cancelled');

    // Someone buys everything left; then the slow payment arrives: refunded, not oversold.
    const fast = await shopper('fast');
    const left = (await stockOf(partnerVariant)).stock;
    await prisma.productVariant.update({ where: { id: partnerVariant }, data: { stock: 1 } });
    await http().put('/v1/me/cart').set(fast.auth).send({ variantId: partnerVariant, quantity: 1 }).expect(200);
    const fastCheckout = (await http().post('/v1/me/checkout').set(fast.auth).send({ addressId: fast.addressId }).expect(201)).body;
    await pay(fast.auth, fastCheckout.reference);
    await pay(slow.auth, checkout.reference);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderIds[0] } })).toMatchObject({ status: 'cancelled', refundDue: true });
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: checkout.reference } })).status).toBe('refunded');
    expect((await stockOf(partnerVariant)).stock).toBe(0);
    await prisma.productVariant.update({ where: { id: partnerVariant }, data: { stock: left } });
  });
});
