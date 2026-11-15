import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { estimateWorkoutMinutes, type WorkoutCard, type WorkoutsHome } from '@bgym/shared';
import { AppModule } from '../src/app.module.js';
import { TokenService } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { WorkoutsService } from '../src/workouts/workouts.service.js';

const run = `wo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DAY = 86_400_000;

describe('Workouts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const users: string[] = [];
  const workouts: string[] = [];
  const exercises: string[] = [];
  const http = () => request(app.getHttpServer());

  async function user(label: string, roles: Array<'member' | 'admin'> = ['member']) {
    const u = await prisma.user.create({ data: { email: `${label}.${run}@example.com`, name: `${label} Tester`, roles } });
    users.push(u.id);
    return { ...u, auth: { Authorization: `Bearer ${(await app.get(TokenService).startSession(u.id, roles, {})).accessToken}` } };
  }
  const exercise = (name: string) => ({ name: `${name} ${run}`, bodyPart: 'legs', targetMuscle: 'Quadriceps', equipment: 'None', instructions: ['Stand tall.', 'Squat down.', 'Stand back up.'], tips: ['Knees over toes.'] });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.workout.deleteMany({ where: { id: { in: workouts } } });
    await prisma.exercise.deleteMany({ where: { OR: [{ id: { in: exercises } }, { externalId: { startsWith: `${run}:` } }, { source: run }] } });
    await prisma.membership.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  it('lets only the BGYM team build the library and publish workouts', async () => {
    const admin = await user('admin', ['member', 'admin']);
    const member = await user('member');
    await http().post('/v1/admin/exercises').set(member.auth).send(exercise('Squat')).expect(403);
    await http().post('/v1/admin/exercises').set(admin.auth).send({ ...exercise('Squat'), instructions: [] }).expect(400);
    const squat = (await http().post('/v1/admin/exercises').set(admin.auth).send(exercise('Squat')).expect(201)).body;
    exercises.push(squat.id);
    expect(squat).toMatchObject({ source: 'bgym', isActive: true, usedIn: 0, media: null, tips: ['Knees over toes.'] });

    // A demo photo is processed and stored under the exercise.
    const jpeg = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#ff5a1f' } }).jpeg().toBuffer();
    const withPhoto = (await http().post(`/v1/admin/exercises/${squat.id}/photo`).set(admin.auth).attach('photo', jpeg, 'squat.jpg').expect(201)).body;
    expect(withPhoto.media).toMatchObject({ type: 'image' });
    expect(withPhoto.media.url).toMatch(new RegExp(`exercises/${squat.id}/[0-9a-f-]+\\.webp$`));
    // Members can't upload exercise videos.
    await http().post('/v1/videos').set(member.auth).send({ purpose: 'exercise' }).expect(403);

    // Reps xor time per step.
    const bad = { title: `Legs ${run}`, level: 'beginner', goal: 'strength', isFree: false, steps: [{ exerciseId: squat.id, sets: 3, reps: 10, durationSec: 30 }] };
    await http().post('/v1/admin/workouts').set(admin.auth).send(bad).expect(400);
    const steps = [{ exerciseId: squat.id, sets: 3, reps: 10, restSec: 60 }, { exerciseId: squat.id, sets: 2, durationSec: 45, restSec: 30 }];
    const w = (await http().post('/v1/admin/workouts').set(admin.auth).send({ ...bad, steps }).expect(201)).body;
    workouts.push(w.id);
    expect(w).toMatchObject({ isPublished: false, durationMin: estimateWorkoutMinutes(steps), exerciseCount: 2, locked: false });
    expect(w.steps[0].exercise.instructions).toHaveLength(3);

    // Drafts are invisible to members until published.
    await http().get(`/v1/workouts/${w.id}`).set(member.auth).expect(404);
    await http().patch(`/v1/admin/workouts/${w.id}/publish`).set(member.auth).send({ isPublished: true }).expect(403);
    await http().patch(`/v1/admin/workouts/${w.id}/publish`).set(admin.auth).send({ isPublished: true }).expect(200);
    expect((await http().get(`/v1/admin/exercises/${squat.id}`).set(admin.auth).expect(200)).body.usedIn).toBe(2);
    // Published workouts can't be deleted (members may have them in their history).
    await http().delete(`/v1/admin/workouts/${w.id}`).set(admin.auth).expect(400);
  });

  it('locks paid workouts until the member joins a gym, then logs sessions and streaks', async () => {
    const member = await user('lifter');
    const home = (await http().get('/v1/workouts').set(member.auth).expect(200)).body as WorkoutsHome;
    expect(home.unlocked).toBe(false);
    const free = home.workouts.find((w) => w.isFree) as WorkoutCard;
    const paid = home.workouts.find((w) => !w.isFree) as WorkoutCard;
    expect(free).toMatchObject({ locked: false });
    expect(paid).toMatchObject({ locked: true });

    // Locked: the list of moves shows, the how-to and demos don't, and it can't be logged.
    const locked = (await http().get(`/v1/workouts/${paid.id}`).set(member.auth).expect(200)).body;
    expect(locked.steps[0].exercise.name).toBeTruthy();
    expect(locked.steps[0].exercise.instructions).toBeUndefined();
    expect(locked.steps[0].exercise.media).toBeUndefined();
    await http().post(`/v1/workouts/${paid.id}/sessions`).set(member.auth).send({ durationSec: 600, exercisesCompleted: 3 }).expect(400);

    // Free workouts log; a double tap on Finish counts once.
    await http().post(`/v1/workouts/${free.id}/sessions`).set(member.auth).send({ durationSec: 900, exercisesCompleted: 99, effort: 4 }).expect(400);
    const stats = (await http().post(`/v1/workouts/${free.id}/sessions`).set(member.auth).send({ durationSec: 900, exercisesCompleted: 5, effort: 4 }).expect(201)).body;
    expect(stats).toMatchObject({ thisWeek: 1, streakDays: 1, totalWorkouts: 1, totalMinutes: 15 });
    await http().post(`/v1/workouts/${free.id}/sessions`).set(member.auth).send({ durationSec: 900, exercisesCompleted: 5 }).expect(201);
    const history = (await http().get('/v1/me/workouts/history').set(member.auth).expect(200)).body;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ workout: { id: free.id }, effort: 4, exercisesCompleted: 5 });

    // Any active membership unlocks the whole library.
    const gym = await prisma.gym.findFirstOrThrow({ where: { status: 'active' }, select: { id: true, plans: { take: 1, select: { id: true } } } });
    await prisma.membership.create({ data: { userId: member.id, gymId: gym.id, planId: gym.plans[0]!.id, startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 20 * DAY), status: 'active' } });
    const after = (await http().get('/v1/workouts').set(member.auth).expect(200)).body as WorkoutsHome;
    expect(after.unlocked).toBe(true);
    expect(after.workouts.every((w) => !w.locked)).toBe(true);
    const open = (await http().get(`/v1/workouts/${paid.id}`).set(member.auth).expect(200)).body;
    expect(open.steps[0].exercise.instructions.length).toBeGreaterThan(0);
    await http().post(`/v1/workouts/${paid.id}/sessions`).set(member.auth).send({ durationSec: 1200, exercisesCompleted: 4 }).expect(201);
    expect(after.workouts.find((w) => w.id === free.id)?.doneCount).toBe(1);
  });

  it('counts a streak of consecutive days ending today or yesterday', async () => {
    const member = await user('streak');
    const workout = await prisma.workout.findFirstOrThrow({ where: { isPublished: true, isFree: true } });
    const now = new Date('2026-11-18T12:00:00Z'); // a Wednesday
    for (const daysAgo of [1, 2, 3, 5]) {
      await prisma.workoutSession.create({ data: { userId: member.id, workoutId: workout.id, durationSec: 600, exercisesCompleted: 3, exercisesTotal: 5, completedAt: new Date(now.getTime() - daysAgo * DAY) } });
    }
    const stats = await app.get(WorkoutsService).stats(member.id, now);
    // Mon 16th and Tue 17th are this week; Sun 15th and Fri 13th are last week.
    expect(stats).toMatchObject({ streakDays: 3, thisWeek: 2, totalWorkouts: 4, totalMinutes: 40 });
    await prisma.workoutSession.deleteMany({ where: { userId: member.id } });
  });

  it('imports a licensed library export by source and id, updating on re-import', async () => {
    const admin = await user('importer', ['member', 'admin']);
    const body = { source: run, exercises: [{ externalId: '0001', name: '3/4 sit-up', bodyPart: 'Waist', instructions: ['Lie down.', 'Sit up.'], animationUrl: 'https://cdn.example.com/0001.gif' }] };
    await http().post('/v1/admin/exercises/import').set(admin.auth).send({ ...body, exercises: [{ ...body.exercises[0], animationUrl: 'http://cdn.example.com/x.gif' }] }).expect(400);
    expect((await http().post('/v1/admin/exercises/import').set(admin.auth).send(body).expect(200)).body).toEqual({ created: 1, updated: 0 });
    expect((await http().post('/v1/admin/exercises/import').set(admin.auth).send(body).expect(200)).body).toEqual({ created: 0, updated: 1 });
    const row = await prisma.exercise.findUniqueOrThrow({ where: { externalId: `${run}:0001` } });
    expect(row).toMatchObject({ source: run, bodyPart: 'waist', animationUrl: 'https://cdn.example.com/0001.gif' });
  });
});
