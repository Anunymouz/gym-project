import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { StoriesService } from '../src/feed/stories.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

const run = `comm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 86_400_000;

let hasFfmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  hasFfmpeg = false;
}

/** A small test clip made with ffmpeg: colour bars with a tone, `seconds` long. */
function clip(dir: string, seconds: number): Buffer {
  const out = join(dir, `clip-${seconds}.mp4`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=320x568:rate=15:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=duration=${seconds}`, '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-metadata', 'location=+05.6037-000.1870/', out]);
  return readFileSync(out);
}

describe('Gym communities: member posts, video, comments, stories, blocks (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let gymId = '';
  let otherGymId = '';
  let photo: Buffer;
  let dir = '';
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'gym_staff' | 'admin'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles, communityAcceptedAt: new Date() } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }
  async function memberOf(gym: string, label: string) {
    const u = await user(label);
    const plan = await prisma.membershipPlan.findFirstOrThrow({ where: { gymId: gym } });
    await prisma.membership.create({ data: { userId: u.id, gymId: gym, planId: plan.id, startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 20 * DAY), status: 'active' } });
    return u;
  }
  const memberPost = (auth: Record<string, string>, gym: string, body: string, photos = 0, videoId?: string) => {
    const req = http().post('/v1/posts').set(auth).field('gymId', gym).field('body', body);
    if (videoId) req.field('videoId', videoId);
    for (let i = 0; i < photos; i++) req.attach('photos', photo, `p${i}.jpg`);
    return req;
  };
  const feedIds = async (auth: Record<string, string>) => ((await http().get('/v1/feed').set(auth).expect(200)).body.posts as { id: string }[]).map((p) => p.id);
  async function uploadVideo(auth: Record<string, string>, purpose: 'post' | 'story', file: Buffer) {
    const ticket = (await http().post('/v1/videos').set(auth).send({ purpose }).expect(201)).body;
    expect(ticket).toMatchObject({ authenticated: true, uploadUrl: `/v1/videos/${ticket.id}/file`, maxSeconds: purpose === 'post' ? 180 : 60 });
    const res = await http().post(ticket.uploadUrl).set(auth).attach('file', file, 'clip.mp4').expect(200);
    return res.body as { id: string; status: string; error: string | null; posterUrl: string | null; durationSec: number | null };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    gymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'legon-strength-club' } })).id;
    otherGymId = (await prisma.gym.findUniqueOrThrow({ where: { slug: 'pulse-studio-airport' } })).id;
    photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#5b4bdb' } }).jpeg().toBuffer();
    dir = mkdtempSync(join(tmpdir(), 'bgym-test-'));
  });

  afterAll(async () => {
    await prisma.story.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.post.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.videoUpload.deleteMany({ where: { userId: { in: users } } });
    await prisma.report.deleteMany({ where: { reporterUserId: { in: users } } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.gymStaff.deleteMany({ where: { userId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    rmSync(dir, { recursive: true, force: true });
    await app.close();
  });

  it('lets members post to their gym; only that gym’s community sees it', async () => {
    const ama = await memberOf(gymId, 'ama');
    const kofi = await memberOf(gymId, 'kofi');
    const other = await memberOf(otherGymId, 'other');
    const owner = await user('owner', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });

    await memberPost(other.auth, gymId, 'Not my gym').expect(403);
    await memberPost(ama.auth, gymId, '').expect(400);
    const created = (await memberPost(ama.auth, gymId, 'Leg day done 💪', 2).expect(201)).body;
    expect(created).toMatchObject({ author: { kind: 'member', id: ama.id, name: 'ama Tester' }, mine: true, commentCount: 0, media: [{ type: 'image' }, { type: 'image' }] });

    expect(await feedIds(kofi.auth)).toContain(created.id);
    expect(await feedIds(owner.auth)).toContain(created.id); // staff see their gym's community
    expect(await feedIds(other.auth)).not.toContain(created.id);
    await http().get(`/v1/posts/${created.id}`).set(other.auth).expect(404);
    expect((await http().get(`/v1/posts/${created.id}`).set(kofi.auth).expect(200)).body.mine).toBe(false);

    // Not on the public gym page, and a shared link only says which gym it's from.
    const publicPosts = (await http().get('/v1/gyms/legon-strength-club/posts').expect(200)).body as { id: string }[];
    expect(publicPosts.some((p) => p.id === created.id)).toBe(false);
    expect((await http().get(`/v1/public/posts/${created.id}`).expect(200)).body).toEqual({ gym: expect.objectContaining({ name: 'Legon Strength Club' }), post: null });

    // Staff see it in the dashboard and can take it down; others can't delete it.
    const staffList = (await http().get(`/v1/staff/gyms/${gymId}/posts`).set(owner.auth).expect(200)).body as { id: string; authorName: string }[];
    expect(staffList.find((p) => p.id === created.id)?.authorName).toBe('ama Tester');
    await http().delete(`/v1/posts/${created.id}`).set(kofi.auth).expect(404);
    await http().delete(`/v1/posts/${created.id}`).set(ama.auth).expect(204);
    expect(await feedIds(kofi.auth)).not.toContain(created.id);
  });

  it('needs the community rules accepted before posting', async () => {
    const newbie = await memberOf(gymId, 'newbie');
    await prisma.user.update({ where: { id: newbie.id }, data: { communityAcceptedAt: null } });
    expect((await http().get('/v1/stories').set(newbie.auth).expect(200)).body).toMatchObject({ communityAccepted: false, postableGyms: [{ id: gymId, name: 'Legon Strength Club' }] });
    expect((await memberPost(newbie.auth, gymId, 'Hi all').expect(403)).body.code).toBe('community_rules');
    await http().post('/v1/me/community-rules').set(newbie.auth).expect(204);
    await memberPost(newbie.auth, gymId, 'Hi all').expect(201);
    expect((await http().get('/v1/stories').set(newbie.auth).expect(200)).body.communityAccepted).toBe(true);
  });

  it.skipIf(!hasFfmpeg)('uploads, converts and posts a video, and refuses ones that are too long', async () => {
    const ama = await memberOf(gymId, 'video');
    const kofi = await memberOf(gymId, 'viewer');

    const ready = await uploadVideo(ama.auth, 'post', clip(dir, 3));
    expect(ready).toMatchObject({ status: 'ready', error: null });
    expect(ready.durationSec).toBeGreaterThan(2.5);
    const upload = await prisma.videoUpload.findUniqueOrThrow({ where: { id: ready.id } });
    // Converted, with metadata (such as a GPS location) removed.
    const stored = (await http().get(`/v1/media/${upload.providerId}`).expect(200)).body as Buffer;
    expect(stored.includes(Buffer.from('+05.6037'))).toBe(false);
    await http().get(`/v1/media/${upload.providerId}`).set('Range', 'bytes=0-99').expect(206);
    await http().get(`/v1/videos/${ready.id}`).set(kofi.auth).expect(404); // someone else's upload

    await memberPost(ama.auth, gymId, 'Photos and a video', 1, ready.id).expect(400);
    const post = (await memberPost(ama.auth, gymId, 'New PR 🎉', 0, ready.id).expect(201)).body;
    expect(post.media).toEqual([expect.objectContaining({ type: 'video', url: `/v1/media/${upload.providerId}`, durationSec: expect.any(Number) })]);
    await memberPost(ama.auth, gymId, 'Again', 0, ready.id).expect(400); // a video is used once

    // A story's video can be up to 60 seconds.
    const long = await uploadVideo(ama.auth, 'story', clip(dir, 63));
    expect(long).toMatchObject({ status: 'failed', error: 'Videos can be up to 1 minute long.' });
    await http().post('/v1/stories').set(ama.auth).field('gymId', gymId).field('videoId', long.id).expect(400);

    // Not a video at all.
    const junk = await uploadVideo(ama.auth, 'post', Buffer.from('definitely not a video'));
    expect(junk.status).toBe('failed');
    // A ticket can't be uploaded to twice.
    await http().post(`/v1/videos/${ready.id}/file`).set(ama.auth).attach('file', clip(dir, 3), 'clip.mp4').expect(404);
    expect(await feedIds(kofi.auth)).toContain(post.id);
  });

  it('lets the community comment; authors and staff moderate; counts stay exact', async () => {
    const ama = await memberOf(gymId, 'author');
    const kofi = await memberOf(gymId, 'commenter');
    const other = await memberOf(otherGymId, 'outsider');
    const manager = await user('manager', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: manager.id, role: 'manager' } });
    const post = (await memberPost(ama.auth, gymId, 'Who’s training tomorrow at 6?').expect(201)).body;

    await http().post(`/v1/posts/${post.id}/comments`).set(other.auth).send({ body: 'Me!' }).expect(404);
    await http().post(`/v1/posts/${post.id}/comments`).set(kofi.auth).send({ body: '   ' }).expect(400);
    const c1 = (await http().post(`/v1/posts/${post.id}/comments`).set(kofi.auth).send({ body: 'I’m in 🙌' }).expect(201)).body;
    const c2 = (await http().post(`/v1/posts/${post.id}/comments`).set(kofi.auth).send({ body: 'Spam spam' }).expect(201)).body;
    const c3 = (await http().post(`/v1/posts/${post.id}/comments`).set(ama.auth).send({ body: 'See you there' }).expect(201)).body;
    expect(c1).toMatchObject({ body: 'I’m in 🙌', author: { id: kofi.id, name: 'commenter Tester' }, canDelete: true });

    const list = (await http().get(`/v1/posts/${post.id}/comments`).set(ama.auth).expect(200)).body;
    expect(list.comments.map((c: { id: string }) => c.id)).toEqual([c1.id, c2.id, c3.id]);
    expect(list.comments.every((c: { canDelete: boolean }) => c.canDelete)).toBe(true); // it's ama's post
    const asKofi = (await http().get(`/v1/posts/${post.id}/comments`).set(kofi.auth).expect(200)).body.comments as { id: string; canDelete: boolean }[];
    expect(asKofi.find((c) => c.id === c3.id)?.canDelete).toBe(false);
    await http().delete(`/v1/comments/${c3.id}`).set(kofi.auth).expect(404);

    // Post author removes one; the manager removes another (audited); double deletes don't double count.
    await http().delete(`/v1/comments/${c2.id}`).set(ama.auth).expect(200);
    await http().delete(`/v1/comments/${c2.id}`).set(ama.auth).expect(404);
    expect((await http().delete(`/v1/comments/${c1.id}`).set(manager.auth).expect(200)).body).toEqual({ commentCount: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'comment.removed', targetId: c1.id } })).toBe(1);
    expect((await http().get(`/v1/posts/${post.id}`).set(kofi.auth).expect(200)).body.commentCount).toBe(1);

    // Reported comments reach the BGYM team, who can remove them.
    await http().post(`/v1/comments/${c3.id}/report`).set(kofi.auth).send({ reason: 'offensive' }).expect(204);
    const admin = await user('admin', ['member', 'admin']);
    const reports = (await http().get('/v1/admin/reports').set(admin.auth).expect(200)).body as { targetType: string; target: { id: string; author: string } | null }[];
    expect(reports.find((r) => r.target?.id === c3.id)).toMatchObject({ targetType: 'comment', target: { author: 'author Tester' } });
    await http().post(`/v1/admin/comments/${c3.id}/remove`).set(admin.auth).expect(204);
    expect((await http().get(`/v1/posts/${post.id}`).set(kofi.auth).expect(200)).body.commentCount).toBe(0);
  });

  it('runs stories: 24 hours, views counted once, likes, and only for the gym’s community', async () => {
    const ama = await memberOf(gymId, 'storyteller');
    const kofi = await memberOf(gymId, 'watcher');
    const other = await memberOf(otherGymId, 'elsewhere');
    const owner = await user('storyowner', ['gym_staff']);
    await prisma.gymStaff.create({ data: { gymId, userId: owner.id, role: 'owner' } });

    await http().post('/v1/stories').set(other.auth).field('gymId', gymId).attach('photos', photo, 's.jpg').expect(403);
    await http().post('/v1/stories').set(ama.auth).field('gymId', gymId).expect(400); // nothing in it
    const mine = (await http().post('/v1/stories').set(ama.auth).field('gymId', gymId).field('caption', 'Morning sweat').attach('photos', photo, 's.jpg').expect(201)).body;
    expect(mine.groups[0]).toMatchObject({ mine: true, author: { kind: 'member', id: ama.id }, stories: [{ caption: 'Morning sweat', viewCount: 0, likeCount: 0, seen: true }] });
    await http().post(`/v1/staff/gyms/${gymId}/stories`).set(owner.auth).field('caption', 'Open till 10 tonight').attach('photos', photo, 'g.jpg').expect(201);

    const tray = (await http().get('/v1/stories').set(kofi.auth).expect(200)).body;
    const amaGroup = tray.groups.find((g: { author: { id?: string } }) => g.author.id === ama.id);
    const gymGroup = tray.groups.find((g: { key: string }) => g.key === `gym:${gymId}`);
    expect(amaGroup).toMatchObject({ mine: false, allSeen: false });
    expect(amaGroup.stories[0].viewCount).toBeUndefined(); // only the author sees counts
    expect(gymGroup.author).toEqual({ kind: 'gym' });
    expect((await http().get('/v1/stories').set(other.auth).expect(200)).body.groups.some((g: { key: string }) => g.key === `gym:${gymId}`)).toBe(false);

    const storyId = amaGroup.stories[0].id;
    await http().post(`/v1/stories/${storyId}/view`).set(other.auth).expect(404);
    await http().post(`/v1/stories/${storyId}/view`).set(kofi.auth).expect(204);
    await http().post(`/v1/stories/${storyId}/view`).set(kofi.auth).expect(204);
    await http().post(`/v1/stories/${storyId}/view`).set(ama.auth).expect(204); // own view: not counted
    await http().put(`/v1/stories/${storyId}/like`).set(kofi.auth).expect(200);
    await http().put(`/v1/stories/${storyId}/like`).set(kofi.auth).expect(200);
    expect((await http().get('/v1/stories').set(ama.auth).expect(200)).body.groups[0].stories[0]).toMatchObject({ viewCount: 1, likeCount: 1 });
    const seen = (await http().get('/v1/stories').set(kofi.auth).expect(200)).body.groups.find((g: { author: { id?: string } }) => g.author.id === ama.id);
    expect(seen).toMatchObject({ allSeen: true, stories: [{ seen: true, likedByMe: true }] });

    // After 24 hours it's gone, and the cleanup deletes it.
    await prisma.story.update({ where: { id: storyId }, data: { expiresAt: new Date(Date.now() - 2 * 60 * 60_000) } });
    expect((await http().get('/v1/stories').set(kofi.auth).expect(200)).body.groups.some((g: { author: { id?: string } }) => g.author.id === ama.id)).toBe(false);
    await http().post(`/v1/stories/${storyId}/view`).set(kofi.auth).expect(404);
    expect(await app.get(StoriesService).cleanup()).toBeGreaterThanOrEqual(1);
    expect(await prisma.story.count({ where: { id: storyId } })).toBe(0);
  });

  it('blocking hides both people’s posts, comments and stories from each other', async () => {
    const ama = await memberOf(gymId, 'blocker');
    const troll = await memberOf(gymId, 'troll');
    const amaPost = (await memberPost(ama.auth, gymId, 'My progress').expect(201)).body;
    const trollPost = (await memberPost(troll.auth, gymId, 'Annoying post').expect(201)).body;
    await http().post(`/v1/posts/${amaPost.id}/comments`).set(troll.auth).send({ body: 'Rude comment' }).expect(201);
    await http().post('/v1/stories').set(troll.auth).field('gymId', gymId).attach('photos', photo, 's.jpg').expect(201);

    await http().put(`/v1/me/blocks/${ama.id}`).set(ama.auth).expect(400);
    await http().put(`/v1/me/blocks/${troll.id}`).set(ama.auth).expect(204);
    await http().put(`/v1/me/blocks/${troll.id}`).set(ama.auth).expect(204);
    expect((await http().get('/v1/me/blocks').set(ama.auth).expect(200)).body).toEqual([expect.objectContaining({ id: troll.id, name: 'troll Tester' })]);

    expect(await feedIds(ama.auth)).not.toContain(trollPost.id);
    expect(await feedIds(troll.auth)).not.toContain(amaPost.id);
    await http().get(`/v1/posts/${amaPost.id}`).set(troll.auth).expect(404);
    expect((await http().get(`/v1/posts/${amaPost.id}/comments`).set(ama.auth).expect(200)).body.comments).toEqual([]);
    expect((await http().get('/v1/stories').set(ama.auth).expect(200)).body.groups.some((g: { author: { id?: string } }) => g.author.id === troll.id)).toBe(false);

    await http().delete(`/v1/me/blocks/${troll.id}`).set(ama.auth).expect(204);
    expect(await feedIds(ama.auth)).toContain(trollPost.id);
  });
});
