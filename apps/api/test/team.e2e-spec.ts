import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `team${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe('Gym staff and invitations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mail: MailService;
  let gymId = '';
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles: ['member'] } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, ['member'], {})).accessToken}` } };
  }
  const team = (u: { auth: Record<string, string> }) => http().get(`/v1/staff/gyms/${gymId}/team`).set(u.auth);
  const invite = (u: { auth: Record<string, string> }, email: string, role: string) => http().post(`/v1/staff/gyms/${gymId}/invitations`).set(u.auth).send({ email, role });
  const myInvite = async (u: { auth: Record<string, string> }) => (await http().get('/v1/me/invitations').set(u.auth).expect(200)).body[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    gymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'osu-body-lab' } })).id;
  });

  afterAll(async () => {
    await prisma.gymInvitation.deleteMany({ where: { gymId, email: { endsWith: `.${run}@example.com` } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('invites by email; only that person can accept, once', async () => {
    const owner = await user('owner');
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });
    const esi = await user('esi');
    const other = await user('other');

    await invite(owner, esi.email, 'manager').expect(201);
    expect(mail.outbox.get(esi.email)?.subject).toBe("You're invited to Body Lab Osu on BGYM");
    await invite(owner, esi.email.toUpperCase(), 'front_desk').expect(201); // same person, new role: one invitation
    const t = (await team(owner).expect(200)).body;
    expect(t.invitations).toEqual([expect.objectContaining({ email: esi.email, role: 'front_desk', invitedBy: 'owner Tester' })]);

    const inv = await myInvite(esi);
    expect(inv).toMatchObject({ gymName: 'Body Lab Osu', role: 'front_desk', invitedBy: 'owner Tester' });
    await http().post(`/v1/me/invitations/${inv.id}/accept`).set(other.auth).expect(404); // not their email
    await http().get(`/v1/staff/gyms/${gymId}/overview`).set(esi.auth).expect(403);
    const [a, b] = await Promise.all([http().post(`/v1/me/invitations/${inv.id}/accept`).set(esi.auth), http().post(`/v1/me/invitations/${inv.id}/accept`).set(esi.auth)]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 404]);
    await http().get(`/v1/staff/gyms/${gymId}/overview`).set(esi.auth).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: esi.id } })).roles).toContain('gym_staff');
    expect(await myInvite(esi)).toBeUndefined();
    await invite(owner, esi.email, 'manager').expect(409); // already on the team
  });

  it('lets managers handle front desk only, and front desk invite no one', async () => {
    const owner = await user('owner2');
    const manager = await user('manager');
    const desk = await user('desk');
    await prisma.gymStaff.createMany({ data: [{ gymId, userId: owner.id, role: 'owner' }, { gymId, userId: manager.id, role: 'manager' }, { gymId, userId: desk.id, role: 'front_desk' }] });

    await invite(desk, `x.${run}@example.com`, 'front_desk').expect(403);
    await invite(manager, `y.${run}@example.com`, 'manager').expect(403);
    await invite(manager, `z.${run}@example.com`, 'front_desk').expect(201);
    const ownersInvite = (await invite(owner, `w.${run}@example.com`, 'manager').expect(201)).body.invitations.find((i: { role: string }) => i.role === 'manager');
    await http().delete(`/v1/staff/gyms/${gymId}/invitations/${ownersInvite.id}`).set(manager.auth).expect(403);
    await http().delete(`/v1/staff/gyms/${gymId}/invitations/${ownersInvite.id}`).set(owner.auth).expect(200);

    await http().patch(`/v1/staff/gyms/${gymId}/team/${desk.id}`).set(manager.auth).send({ role: 'manager' }).expect(403); // owners change roles
    await http().delete(`/v1/staff/gyms/${gymId}/team/${owner.id}`).set(manager.auth).expect(403);
    await http().delete(`/v1/staff/gyms/${gymId}/team/${desk.id}`).set(manager.auth).expect(200);
    await http().get(`/v1/staff/gyms/${gymId}/overview`).set(desk.auth).expect(403); // access ends immediately
  });

  it('never leaves a gym without an owner, even when two owners act at once', async () => {
    const gym = await prisma.gym.findUniqueOrThrow({ where: { slug: 'fithub-tema' } });
    const ama = await user('ama');
    const kofi = await user('kofi');
    await prisma.gymStaff.createMany({ data: [{ gymId: gym.id, userId: ama.id, role: 'owner' }, { gymId: gym.id, userId: kofi.id, role: 'owner' }] });
    const base = `/v1/staff/gyms/${gym.id}/team`;

    const [x, y] = await Promise.all([
      http().patch(`${base}/${kofi.id}`).set(ama.auth).send({ role: 'manager' }),
      http().patch(`${base}/${ama.id}`).set(kofi.auth).send({ role: 'manager' }),
    ]);
    expect([x.status, y.status].sort((p, q) => p - q)).toEqual([200, 409]);
    const owners = await prisma.gymStaff.count({ where: { gymId: gym.id, role: 'owner', userId: { in: [ama.id, kofi.id] } } });
    expect(owners).toBe(1);

    const lastOwner = (await prisma.gymStaff.findFirstOrThrow({ where: { gymId: gym.id, role: 'owner', userId: { in: [ama.id, kofi.id] } } })).userId;
    const auth = lastOwner === ama.id ? ama.auth : kofi.auth;
    const res = await http().delete(`${base}/${lastOwner}`).set(auth).expect(409); // can't leave as the last owner
    expect(res.body.message).toContain('at least one owner');
    await prisma.gymStaff.deleteMany({ where: { gymId: gym.id, userId: { in: [ama.id, kofi.id] } } });
  });

  it('lets people decline', async () => {
    const owner = await user('owner3');
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });
    const yaw = await user('yaw');
    await invite(owner, yaw.email, 'front_desk').expect(201);
    const inv = await myInvite(yaw);
    await http().post(`/v1/me/invitations/${inv.id}/decline`).set(yaw.auth).expect(200);
    await http().post(`/v1/me/invitations/${inv.id}/accept`).set(yaw.auth).expect(404);
    expect((await team(owner).expect(200)).body.invitations.some((i: { email: string }) => i.email === yaw.email)).toBe(false);
  });
});
