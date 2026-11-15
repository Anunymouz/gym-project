import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { sha256 } from '../src/common/crypto.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `auth${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const emailA = `ama.${run}@example.com`;
const emailB = `kojo.${run}@example.com`;
const emailC = `esi.${run}@example.com`;

describe('Sign-in with email code (e2e)', () => {
  let app: INestApplication<App>;
  let mail: MailService;
  const http = () => request(app.getHttpServer());
  const codeFor = (email: string) => /\b(\d{6})\b/.exec(mail.outbox.get(email)?.text ?? '')?.[1] ?? '';
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    mail = app.get(MailService);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const emails = [emailA, emailB, emailC];
    await prisma.emailOtp.deleteMany({ where: { email: { in: emails } } });
    await prisma.auditLog.deleteMany({ where: { actor: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  let refreshA = '';
  let accessA = '';

  it('sends a code with the same response for any address', async () => {
    const res = await http().post('/v1/auth/email/request').send({ email: `  ${emailA.toUpperCase()} ` }).expect(202);
    expect(res.body).toEqual({ sent: true, retryAfterSeconds: 30 });
    expect(codeFor(emailA)).toMatch(/^\d{6}$/);
    expect(mail.outbox.get(emailA)?.subject).toContain('BGYM sign-in code');
  });

  it('stores only a hash of the code', async () => {
    const otp = await app.get(PrismaService).emailOtp.findFirstOrThrow({ where: { email: emailA } });
    expect(otp.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(otp.codeHash).not.toContain(codeFor(emailA));
  });

  it('honours the resend cooldown without revealing it', async () => {
    const before = mail.outbox.get(emailA);
    await http().post('/v1/auth/email/request').send({ email: emailA }).expect(202);
    expect(mail.outbox.get(emailA)).toBe(before);
  });

  it('rejects a wrong code with a generic message', async () => {
    const res = await http().post('/v1/auth/email/verify').send({ email: emailA, code: wrong(codeFor(emailA)) }).expect(401);
    expect(res.body.message).toBe('That code is incorrect or has expired.');
  });

  it('signs in with the right code and creates the account', async () => {
    const res = await http().post('/v1/auth/email/verify').send({ email: emailA, code: codeFor(emailA) }).expect(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user).toMatchObject({ email: emailA, roles: ['member'] });
    expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    accessA = res.body.accessToken;
    refreshA = res.body.refreshToken;
  });

  it('never accepts the same code twice', async () => {
    await http().post('/v1/auth/email/verify').send({ email: emailA, code: codeFor(emailA) }).expect(401);
  });

  it('protects routes by default', async () => {
    await http().get('/v1/auth/me').expect(401);
    await http().get('/v1/auth/me').set('Authorization', 'Bearer not-a-token').expect(401);
    const res = await http().get('/v1/auth/me').set('Authorization', `Bearer ${accessA}`).expect(200);
    expect(res.body.email).toBe(emailA);
  });

  it('saves the profile step', async () => {
    const res = await http()
      .patch('/v1/auth/me')
      .set('Authorization', `Bearer ${accessA}`)
      .send({ name: ' Ama Owusu ', goal: 'build_strength', phone: '024 123 4567' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Ama Owusu', goal: 'build_strength', phone: '+233241234567' });
    await http().patch('/v1/auth/me').set('Authorization', `Bearer ${accessA}`).send({ name: 'A' }).expect(400);
    await http().patch('/v1/auth/me').send({ name: 'Ama Owusu' }).expect(401);
  });

  it('rotates refresh tokens; a near-simultaneous reuse is refused without ending the session', async () => {
    const first = await http().post('/v1/auth/refresh').send({ refreshToken: refreshA }).expect(200);
    expect(first.body.refreshToken).not.toBe(refreshA);
    await http().post('/v1/auth/refresh').send({ refreshToken: refreshA }).expect(401);
    const second = await http().post('/v1/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(200);
    refreshA = second.body.refreshToken;
  });

  it('revokes every session when an old refresh token is reused later (theft)', async () => {
    const used = refreshA;
    const next = await http().post('/v1/auth/refresh').send({ refreshToken: used }).expect(200);
    // Age the old session past the grace window, as if a thief replayed it later.
    await app.get(PrismaService).session.updateMany({ where: { refreshTokenHash: sha256(used) }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    await http().post('/v1/auth/refresh').send({ refreshToken: used }).expect(401);
    await http().post('/v1/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(401);
  });

  it('signs out by revoking the session', async () => {
    await http().post('/v1/auth/email/request').send({ email: emailB }).expect(202);
    const res = await http().post('/v1/auth/email/verify').send({ email: emailB, code: codeFor(emailB) }).expect(200);
    await http().post('/v1/auth/sign-out').send({ refreshToken: res.body.refreshToken }).expect(204);
    await http().post('/v1/auth/refresh').send({ refreshToken: res.body.refreshToken }).expect(401);
  });

  it('locks a code after 5 wrong attempts', async () => {
    await http().post('/v1/auth/email/request').send({ email: emailC }).expect(202);
    const code = codeFor(emailC);
    for (let i = 0; i < 5; i++) {
      await http().post('/v1/auth/email/verify').send({ email: emailC, code: wrong(code) }).expect(401);
    }
    await http().post('/v1/auth/email/verify').send({ email: emailC, code }).expect(401);
  });

  it('rate-limits code verification per client', async () => {
    const res = await http().post('/v1/auth/email/verify').send({ email: emailC, code: '123456' });
    expect(res.status).toBe(429);
  });

  it('validates input', async () => {
    await http().post('/v1/auth/email/request').send({ email: 'not-an-email' }).expect(400);
    await http().post('/v1/auth/refresh').send({ refreshToken: 'short' }).expect(400);
  });
});
