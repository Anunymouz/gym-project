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

const run = `pho${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A real JPEG. With orientation 6 it's stored sideways and must come out upright. */
const jpeg = (width: number, height: number, opts: { orientation?: number; gps?: boolean } = {}) =>
  sharp({ create: { width, height, channels: 3, background: { r: 255, g: 90, b: 31 } } })
    .jpeg()
    .withMetadata({ ...(opts.orientation && { orientation: opts.orientation }) })
    .withExif(opts.gps ? { IFD0: { Copyright: 'BGYM test' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '5/1 37/1 8/1' } } : {})
    .toBuffer();

describe('Gym photos (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gymId = '';
  let coverBefore: string | null = null;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'gym_staff'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: label, roles } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const gym = await prisma.gym.findUniqueOrThrow({ where: { slug: 'legon-strength-club' } });
    gymId = gym.id;
    coverBefore = gym.coverUrl;
  });

  afterAll(async () => {
    const left = await prisma.gymPhoto.findMany({ where: { gymId } });
    for (const p of left) await http().delete(`/v1/staff/gyms/${gymId}/photos/${p.id}`); // best effort: owners may be gone
    await prisma.gymPhoto.deleteMany({ where: { gymId } });
    await prisma.gym.update({ where: { id: gymId }, data: { coverUrl: coverBefore } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('cleans, resizes and orders photos; the first is the cover', async () => {
    const owner = await user('owner', ['gym_staff']);
    const desk = await user('desk', ['gym_staff']);
    const outsider = await user('outsider');
    await prisma.gymStaff.createMany({ data: [{ gymId, userId: owner.id, role: 'owner' }, { gymId, userId: desk.id, role: 'front_desk' }] });
    const base = `/v1/staff/gyms/${gymId}/photos`;
    const upload = (auth: Record<string, string>, buf: Buffer, name = 'photo.jpg') => http().post(base).set(auth).attach('photo', buf, { filename: name, contentType: 'image/jpeg' });

    await upload(desk.auth, await jpeg(1200, 900)).expect(403);
    await http().get(base).set(outsider.auth).expect(403);
    await upload(owner.auth, await jpeg(400, 300)).expect(400); // too small
    await upload(owner.auth, Buffer.from('<?php echo "not a photo"; ?>'), 'evil.jpg').expect(400);

    // A portrait photo stored sideways (EXIF orientation 6), carrying GPS.
    const first = (await upload(owner.auth, await jpeg(2400, 1800, { orientation: 6, gps: true })).expect(201)).body;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ width: 1200, height: 1600, isCover: true }); // upright, capped at 1600
    expect(first[0].url).toMatch(/^\/v1\/media\/gyms\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/);

    const served = await http().get(first[0].url).expect(200);
    expect(served.headers['content-type']).toBe('image/webp');
    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined(); // GPS and every other tag removed
    expect((await sharp((await http().get(first[0].thumbUrl).expect(200)).body as Buffer).metadata()).width).toBeLessThanOrEqual(480);

    const second = (await upload(owner.auth, await jpeg(1600, 1000)).expect(201)).body;
    expect(second.map((p: { isCover: boolean }) => p.isCover)).toEqual([true, false]);
    expect((await prisma.gym.findUniqueOrThrow({ where: { id: gymId } })).coverUrl).toBe(first[0].url);

    // Make the second photo the cover: the gym's cover follows, and the app sees it.
    const reordered = (await http().post(`${base}/${second[1].id}/cover`).set(owner.auth).expect(200)).body;
    expect(reordered[0].id).toBe(second[1].id);
    expect((await prisma.gym.findUniqueOrThrow({ where: { id: gymId } })).coverUrl).toBe(second[1].url);
    const pub = (await http().get('/v1/gyms/legon-strength-club').expect(200)).body;
    expect(pub.coverUrl).toBe(second[1].url);
    expect(pub.photos).toEqual([second[1].url, second[0].url]);

    // Delete removes the files too.
    const file = resolve('./.test-storage', second[0].url.replace('/v1/media/', ''));
    expect(existsSync(file)).toBe(true);
    await http().delete(`${base}/${second[0].id}`).set(owner.auth).expect(200);
    expect(existsSync(file)).toBe(false);
    await http().get(second[0].url).expect(404);
  });

  it('refuses paths outside gym photos', async () => {
    await http().get('/v1/media/gyms/..%2F..%2F.env/x.webp').expect(400);
    await http().get('/v1/media/gyms/00000000-0000-0000-0000-000000000000/../../package.json').expect(404);
    await http().get('/v1/media/gyms/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.webp').expect(404);
  });

  it('caps the number of photos', async () => {
    const owner = await user('owner2', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'manager' } });
    const have = await prisma.gymPhoto.count({ where: { gymId } });
    const img = await jpeg(900, 700);
    for (let i = have; i < 12; i++) await http().post(`/v1/staff/gyms/${gymId}/photos`).set(owner.auth).attach('photo', img, 'p.jpg').expect(201);
    const res = await http().post(`/v1/staff/gyms/${gymId}/photos`).set(owner.auth).attach('photo', img, 'p.jpg').expect(409);
    expect(res.body.message).toContain('up to 12 photos');
  });
});
