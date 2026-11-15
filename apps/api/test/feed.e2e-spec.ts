import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `feed${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 86_400_000;

describe('Gym posts and the Home feed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gymId = '';
  let otherGymId = '';
  let photo: Buffer;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'gym_staff' | 'admin'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }
  async function memberOf(gym: string, label: string) {
    const u = await user(label);
    const plan = await prisma.membershipPlan.findFirstOrThrow({ where: { gymId: gym } });
    await prisma.membership.create({ data: { userId: u.id, gymId: gym, planId: plan.id, startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 20 * DAY), status: 'active' } });
    return u;
  }
  const post = (auth: Record<string, string>, body: string, photos = 0) => {
    const req = http().post(`/v1/staff/gyms/${gymId}/posts`).set(auth).field('body', body);
    for (let i = 0; i < photos; i++) req.attach('photos', photo, `p${i}.jpg`);
    return req;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    gymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'legon-strength-club' } })).id;
    otherGymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'pulse-studio-airport' } })).id;
    photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#ff5a1f' } }).jpeg().toBuffer();
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.report.deleteMany({ where: { reporterUserId: { in: users } } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('lets owners and managers post; members of the gym see it, others don’t', async () => {
    const owner = await user('owner', ['gym_staff']);
    const desk = await user('desk', ['gym_staff']);
    await prisma.gymStaff.createMany({ data: [{ gymId, userId: owner.id, role: 'owner' }, { gymId, userId: desk.id, role: 'front_desk' }] });

    await post(desk.auth, 'Hello').expect(403);
    await post(owner.auth, '').expect(400); // nothing to post
    await post(owner.auth, 'x'.repeat(1001)).expect(400);
    const tooMany = await post(owner.auth, 'Five photos', 5);
    expect(tooMany.status).toBeGreaterThanOrEqual(400);

    const created = (await post(owner.auth, 'New squat racks are in! 🏋️', 2).expect(201)).body;
    expect(created).toMatchObject({ status: 'published', body: 'New squat racks are in! 🏋️', author: 'owner Tester' });
    expect(created.media).toHaveLength(2);
    expect(created.media[0].url).toMatch(/^\/v1\/media\/posts\//);
    await http().get(created.media[0].thumbUrl).expect(200);

    const member = await memberOf(gymId, 'member');
    const elsewhere = await memberOf(otherGymId, 'elsewhere');
    const stranger = await user('stranger');
    const feed = (await http().get('/v1/feed').set(member.auth).expect(200)).body;
    expect(feed.gyms).toBe(1);
    expect(feed.posts[0]).toMatchObject({ id: created.id, gym: { name: 'Legon Strength Club' }, likedByMe: false });
    expect((await http().get('/v1/feed').set(elsewhere.auth).expect(200)).body.posts.some((p: { id: string }) => p.id === created.id)).toBe(false);
    expect((await http().get('/v1/feed').set(stranger.auth).expect(200)).body).toEqual({ posts: [], nextCursor: null, gyms: 0 });

    // Public on the gym's page.
    expect((await http().get('/v1/gyms/legon-strength-club/posts').expect(200)).body[0].id).toBe(created.id);

    // Likes: members only, exact under repeats.
    await http().put(`/v1/posts/${created.id}/like`).set(stranger.auth).expect(403);
    await http().put(`/v1/posts/${created.id}/like`).set(member.auth).expect(200);
    const again = (await http().put(`/v1/posts/${created.id}/like`).set(member.auth).expect(200)).body;
    expect(again).toEqual({ likeCount: 1, likedByMe: true });
    expect((await http().get('/v1/feed').set(member.auth).expect(200)).body.posts[0].likedByMe).toBe(true);
    expect((await http().delete(`/v1/posts/${created.id}/like`).set(member.auth).expect(200)).body).toEqual({ likeCount: 0, likedByMe: false });

    // Deleting removes the photo files too.
    const file = resolve('./.test-storage', created.media[0].url.replace('/v1/media/', ''));
    expect(existsSync(file)).toBe(true);
    await http().delete(`/v1/staff/gyms/${gymId}/posts/${created.id}`).set(owner.auth).expect(204);
    expect(existsSync(file)).toBe(false);
  });

  it('pages through the feed newest first without gaps or repeats', async () => {
    const owner = await user('owner2', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'manager' } });
    for (let i = 1; i <= 23; i++) await post(owner.auth, `Post ${i}`).expect(201);
    const member = await memberOf(gymId, 'pager');
    const first = (await http().get('/v1/feed').set(member.auth).expect(200)).body;
    expect(first.posts).toHaveLength(20);
    expect(first.posts[0].body).toBe('Post 23');
    const second = (await http().get('/v1/feed').query({ cursor: first.nextCursor }).set(member.auth).expect(200)).body;
    const ours = [...first.posts, ...second.posts].filter((p: { body: string }) => /^Post \d+$/.test(p.body)).map((p: { body: string }) => p.body);
    expect(ours).toEqual(Array.from({ length: 23 }, (_, i) => `Post ${23 - i}`));
    await http().get('/v1/feed').query({ cursor: 'not-a-cursor' }).set(member.auth).expect(400);
  });

  it('lets anyone report a post once; the BGYM team removes it', async () => {
    const owner = await user('owner3', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });
    const bad = (await post(owner.auth, 'Buy cheap pills here').expect(201)).body;
    const member = await memberOf(gymId, 'reporter');
    const admin = await user('admin', ['member', 'admin']);

    await http().post(`/v1/posts/${bad.id}/report`).set(member.auth).send({ reason: 'nonsense' }).expect(400);
    await http().post(`/v1/posts/${bad.id}/report`).set(member.auth).send({ reason: 'spam', details: 'Selling pills' }).expect(204);
    await http().post(`/v1/posts/${bad.id}/report`).set(member.auth).send({ reason: 'spam' }).expect(409);
    expect((await http().get(`/v1/staff/gyms/${gymId}/posts`).set(owner.auth).expect(200)).body.find((p: { id: string }) => p.id === bad.id).openReports).toBe(1);

    await http().get('/v1/admin/reports').set(member.auth).expect(403);
    const reports = (await http().get('/v1/admin/reports').set(admin.auth).expect(200)).body;
    expect(reports).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'spam', details: 'Selling pills', post: expect.objectContaining({ id: bad.id, gymName: 'Legon Strength Club', reportCount: 1 }) })]));

    await http().post(`/v1/admin/posts/${bad.id}/remove`).set(admin.auth).expect(204);
    expect((await http().get('/v1/feed').set(member.auth).expect(200)).body.posts.some((p: { id: string }) => p.id === bad.id)).toBe(false);
    expect((await http().get('/v1/admin/reports').set(admin.auth).expect(200)).body.some((r: { post: { id: string } | null }) => r.post?.id === bad.id)).toBe(false);
    expect((await http().get(`/v1/staff/gyms/${gymId}/posts`).set(owner.auth).expect(200)).body.find((p: { id: string }) => p.id === bad.id).status).toBe('removed');
  });
});
