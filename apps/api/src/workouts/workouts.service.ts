import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AdminWorkout,
  CompleteSessionInput,
  ExerciseImport,
  ExerciseInput,
  ExerciseItem,
  ExerciseMedia,
  WorkoutCard,
  WorkoutDetail,
  WorkoutGoal,
  WorkoutHistoryItem,
  WorkoutInput,
  WorkoutLevel,
  WorkoutsHome,
  WorkoutStats,
} from '@bgym/shared';
import { estimateWorkoutMinutes, exerciseInputSchema } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { processPhoto } from '../media/image-processor.js';
import { StorageService } from '../media/storage.service.js';
import { VideoService } from '../media/video.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 86_400_000;

const exerciseSelect = {
  id: true, name: true, bodyPart: true, targetMuscle: true, secondaryMuscles: true, equipment: true, instructions: true, tips: true,
  imageKey: true, imageThumbKey: true, animationUrl: true, source: true, isActive: true,
  video: { select: { provider: true, providerId: true, posterKey: true, width: true, height: true, durationSec: true } },
  _count: { select: { workouts: true } },
} satisfies Prisma.ExerciseSelect;
type ExerciseRow = Prisma.ExerciseGetPayload<{ select: typeof exerciseSelect }>;

const workoutSelect = {
  id: true, title: true, description: true, level: true, goal: true, durationMin: true, coverUrl: true, coverKey: true, isFree: true, isPublished: true, updatedAt: true,
  exercises: { orderBy: { sortOrder: 'asc' }, select: { sets: true, reps: true, durationSec: true, restSec: true, notes: true, exercise: { select: exerciseSelect } } },
  _count: { select: { sessions: true } },
} satisfies Prisma.WorkoutSelect;
type WorkoutRow = Prisma.WorkoutGetPayload<{ select: typeof workoutSelect }>;

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Workouts. The BGYM team keeps an exercise library (written by BGYM with its own photos or
 * videos, or imported from a licensed library) and builds routines from it. Free workouts are
 * for everyone; the rest unlock with an active membership at any gym. Members' finished
 * workouts make up their history and streak.
 */
@Injectable()
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly videos: VideoService,
    private readonly audit: AuditService,
  ) {}

  // ── Members ──

  /** An active membership at any gym unlocks everything. The BGYM team sees everything too. */
  async unlocked(userId: string, roles: string[]): Promise<boolean> {
    if (roles.includes('admin')) return true;
    return (await this.prisma.membership.count({ where: { userId, status: 'active', endsAt: { gt: new Date() } } })) > 0;
  }

  async home(userId: string, roles: string[]): Promise<WorkoutsHome> {
    const [unlocked, rows, done, stats] = await Promise.all([
      this.unlocked(userId, roles),
      this.prisma.workout.findMany({ where: { isPublished: true }, orderBy: [{ isFree: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], select: workoutSelect }),
      this.prisma.workoutSession.groupBy({ by: ['workoutId'], where: { userId }, _count: true }),
      this.stats(userId),
    ]);
    const counts = new Map(done.map((d) => [d.workoutId, d._count]));
    return { unlocked, stats, workouts: await Promise.all(rows.map((r) => this.toCard(r, unlocked, counts.get(r.id) ?? 0))) };
  }

  async detail(userId: string, roles: string[], workoutId: string): Promise<WorkoutDetail> {
    const row = await this.prisma.workout.findFirst({ where: { id: workoutId, isPublished: true }, select: workoutSelect });
    if (!row) throw new NotFoundException('Workout not found');
    const unlocked = row.isFree || (await this.unlocked(userId, roles));
    const done = await this.prisma.workoutSession.count({ where: { userId, workoutId } });
    return this.toDetail(row, unlocked, done);
  }

  /** Saves a finished (or partly done) workout to the member's history. Locked workouts can't be logged. */
  async complete(userId: string, roles: string[], workoutId: string, input: CompleteSessionInput): Promise<WorkoutStats> {
    const w = await this.prisma.workout.findFirst({ where: { id: workoutId, isPublished: true }, select: { isFree: true, _count: { select: { exercises: true } } } });
    if (!w) throw new NotFoundException('Workout not found');
    if (!w.isFree && !(await this.unlocked(userId, roles))) throw new BadRequestException('Join any gym to unlock this workout.');
    // A double tap on "Finish" within a minute counts once.
    const recent = await this.prisma.workoutSession.count({ where: { userId, workoutId, completedAt: { gt: new Date(Date.now() - 60_000) } } });
    if (!recent) {
      await this.prisma.workoutSession.create({
        data: { userId, workoutId, durationSec: input.durationSec, exercisesTotal: w._count.exercises, exercisesCompleted: Math.min(input.exercisesCompleted, w._count.exercises), effort: input.effort ?? null },
      });
    }
    return this.stats(userId);
  }

  async history(userId: string): Promise<WorkoutHistoryItem[]> {
    const rows = await this.prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 100,
      select: { id: true, completedAt: true, durationSec: true, exercisesCompleted: true, exercisesTotal: true, effort: true, workout: { select: { id: true, title: true, coverUrl: true, coverThumbKey: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      workout: { id: r.workout.id, title: r.workout.title, coverUrl: r.workout.coverThumbKey ? this.storage.publicUrl(r.workout.coverThumbKey) : r.workout.coverUrl },
      completedAt: r.completedAt.toISOString(),
      durationSec: r.durationSec,
      exercisesCompleted: r.exercisesCompleted,
      exercisesTotal: r.exercisesTotal,
      effort: r.effort,
    }));
  }

  async stats(userId: string, now = new Date()): Promise<WorkoutStats> {
    const rows = await this.prisma.workoutSession.findMany({ where: { userId }, orderBy: { completedAt: 'desc' }, take: 1000, select: { completedAt: true, durationSec: true } });
    // Weeks start on Monday (Accra time = UTC).
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const monday = today - ((now.getUTCDay() + 6) % 7) * DAY;
    const days = new Set(rows.map((r) => Date.UTC(r.completedAt.getUTCFullYear(), r.completedAt.getUTCMonth(), r.completedAt.getUTCDate())));
    let streak = 0;
    for (let d = days.has(today) ? today : today - DAY; days.has(d); d -= DAY) streak++;
    return {
      thisWeek: rows.filter((r) => r.completedAt.getTime() >= monday).length,
      streakDays: streak,
      totalWorkouts: rows.length,
      totalMinutes: Math.round(rows.reduce((s, r) => s + r.durationSec, 0) / 60),
    };
  }

  // ── Exercise library (BGYM team) ──

  async exercises(query: { q?: string; bodyPart?: string }): Promise<ExerciseItem[]> {
    const rows = await this.prisma.exercise.findMany({
      where: {
        ...(query.bodyPart && { bodyPart: query.bodyPart }),
        ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 500,
      select: exerciseSelect,
    });
    return Promise.all(rows.map((r) => this.toExercise(r)));
  }

  async exercise(id: string): Promise<ExerciseItem> {
    const row = await this.prisma.exercise.findUnique({ where: { id }, select: exerciseSelect });
    if (!row) throw new NotFoundException('Exercise not found');
    return this.toExercise(row);
  }

  async saveExercise(actorId: string, id: string | null, raw: ExerciseInput): Promise<ExerciseItem> {
    const input = exerciseInputSchema.parse(raw);
    const data = { name: input.name, bodyPart: input.bodyPart, targetMuscle: input.targetMuscle || null, secondaryMuscles: input.secondaryMuscles, equipment: input.equipment || null, instructions: input.instructions, tips: input.tips };
    const row = id
      ? await this.prisma.exercise.update({ where: { id }, data, select: { id: true } }).catch(() => {
          throw new NotFoundException('Exercise not found');
        })
      : await this.prisma.exercise.create({ data: { ...data, externalId: `bgym:${slugify(input.name)}-${randomUUID().slice(0, 6)}`, source: 'bgym' }, select: { id: true } });
    await this.audit.record({ action: id ? 'exercise.updated' : 'exercise.created', actorId, targetType: 'exercise', targetId: row.id });
    return this.exercise(row.id);
  }

  async setExerciseActive(actorId: string, id: string, isActive: boolean): Promise<ExerciseItem> {
    const { count } = await this.prisma.exercise.updateMany({ where: { id }, data: { isActive } });
    if (!count) throw new NotFoundException('Exercise not found');
    await this.audit.record({ action: 'exercise.active', actorId, targetType: 'exercise', targetId: id, metadata: { isActive } });
    return this.exercise(id);
  }

  /** A demo photo (replaces any photo or video). */
  async setExercisePhoto(id: string, file: Buffer): Promise<ExerciseItem> {
    const ex = await this.prisma.exercise.findUnique({ where: { id }, select: { imageKey: true, imageThumbKey: true, video: { select: { id: true, provider: true, providerId: true, posterKey: true } } } });
    if (!ex) throw new NotFoundException('Exercise not found');
    const photo = await processPhoto(file);
    const fileId = randomUUID();
    const key = `exercises/${id}/${fileId}.webp`;
    const thumbKey = `exercises/${id}/${fileId}_t.webp`;
    await this.storage.put(key, photo.large.data, 'image/webp');
    await this.storage.put(thumbKey, photo.thumb.data, 'image/webp');
    await this.prisma.exercise.update({ where: { id }, data: { imageKey: key, imageThumbKey: thumbKey, videoUploadId: null } });
    await this.dropOldMedia(ex);
    return this.exercise(id);
  }

  /** A demo video (uploaded with purpose "exercise", up to 60 s); replaces any photo. */
  async setExerciseVideo(actorId: string, id: string, videoId: string): Promise<ExerciseItem> {
    const ex = await this.prisma.exercise.findUnique({ where: { id }, select: { imageKey: true, imageThumbKey: true, video: { select: { id: true, provider: true, providerId: true, posterKey: true } } } });
    if (!ex) throw new NotFoundException('Exercise not found');
    await this.prisma.$transaction(async (tx) => {
      const video = await this.videos.claim(tx, actorId, videoId, 'exercise');
      await tx.exercise.update({ where: { id }, data: { videoUploadId: video.id, imageKey: null, imageThumbKey: null } });
    });
    await this.dropOldMedia(ex);
    return this.exercise(id);
  }

  async clearExerciseMedia(id: string): Promise<ExerciseItem> {
    const ex = await this.prisma.exercise.findUnique({ where: { id }, select: { imageKey: true, imageThumbKey: true, video: { select: { id: true, provider: true, providerId: true, posterKey: true } } } });
    if (!ex) throw new NotFoundException('Exercise not found');
    await this.prisma.exercise.update({ where: { id }, data: { imageKey: null, imageThumbKey: null, videoUploadId: null } });
    await this.dropOldMedia(ex);
    return this.exercise(id);
  }

  /** Adds or updates exercises from a library export, matched by source + their id. */
  async importExercises(actorId: string, input: ExerciseImport): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const e of input.exercises) {
      const externalId = `${input.source}:${e.externalId}`;
      const data = { name: e.name, bodyPart: e.bodyPart.toLowerCase().replace(/\s+/g, '_'), targetMuscle: e.targetMuscle ?? null, secondaryMuscles: e.secondaryMuscles ?? [], equipment: e.equipment ?? null, instructions: e.instructions, animationUrl: e.animationUrl ?? null, source: input.source };
      const existing = await this.prisma.exercise.findUnique({ where: { externalId }, select: { id: true } });
      if (existing) {
        await this.prisma.exercise.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await this.prisma.exercise.create({ data: { ...data, externalId } });
        created++;
      }
    }
    await this.audit.record({ action: 'exercise.imported', actorId, targetType: 'platform', metadata: { source: input.source, created, updated } });
    return { created, updated };
  }

  // ── Workouts (BGYM team) ──

  async adminWorkouts(): Promise<AdminWorkout[]> {
    const rows = await this.prisma.workout.findMany({ orderBy: [{ isPublished: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], select: workoutSelect });
    return Promise.all(rows.map((r) => this.toAdmin(r)));
  }

  async adminWorkout(id: string): Promise<AdminWorkout> {
    const row = await this.prisma.workout.findUnique({ where: { id }, select: workoutSelect });
    if (!row) throw new NotFoundException('Workout not found');
    return this.toAdmin(row);
  }

  async saveWorkout(actorId: string, id: string | null, input: WorkoutInput): Promise<AdminWorkout> {
    const exercises = await this.prisma.exercise.findMany({ where: { id: { in: input.steps.map((s) => s.exerciseId) } }, select: { id: true } });
    if (new Set(exercises.map((e) => e.id)).size !== new Set(input.steps.map((s) => s.exerciseId)).size) throw new BadRequestException('One of those exercises isn’t in the library.');
    const durationMin = estimateWorkoutMinutes(input.steps);
    const steps = input.steps.map((s, sortOrder) => ({ exerciseId: s.exerciseId, sortOrder, sets: s.sets ?? null, reps: s.reps ?? null, durationSec: s.durationSec ?? null, restSec: s.restSec ?? null, notes: s.notes || null }));
    const data = { title: input.title, description: input.description || null, level: input.level, goal: input.goal, isFree: input.isFree, durationMin };
    const row = await this.prisma.$transaction(async (tx) => {
      if (id) {
        const found = await tx.workout.count({ where: { id } });
        if (!found) throw new NotFoundException('Workout not found');
        await tx.workoutExercise.deleteMany({ where: { workoutId: id } });
        return tx.workout.update({ where: { id }, data: { ...data, exercises: { create: steps } }, select: { id: true } });
      }
      return tx.workout.create({ data: { ...data, slug: `${slugify(input.title)}-${randomUUID().slice(0, 6)}`, exercises: { create: steps } }, select: { id: true } });
    });
    await this.audit.record({ action: id ? 'workout.updated' : 'workout.created', actorId, targetType: 'workout', targetId: row.id });
    return this.adminWorkout(row.id);
  }

  async publishWorkout(actorId: string, id: string, isPublished: boolean): Promise<AdminWorkout> {
    if (isPublished) {
      const w = await this.prisma.workout.findUnique({ where: { id }, select: { _count: { select: { exercises: true } } } });
      if (!w) throw new NotFoundException('Workout not found');
      if (w._count.exercises === 0) throw new BadRequestException('Add exercises first.');
    }
    const { count } = await this.prisma.workout.updateMany({ where: { id }, data: { isPublished } });
    if (!count) throw new NotFoundException('Workout not found');
    await this.audit.record({ action: isPublished ? 'workout.published' : 'workout.unpublished', actorId, targetType: 'workout', targetId: id });
    return this.adminWorkout(id);
  }

  async setWorkoutCover(id: string, file: Buffer): Promise<AdminWorkout> {
    const w = await this.prisma.workout.findUnique({ where: { id }, select: { coverKey: true, coverThumbKey: true } });
    if (!w) throw new NotFoundException('Workout not found');
    const photo = await processPhoto(file);
    const fileId = randomUUID();
    const key = `workouts/${id}/${fileId}.webp`;
    const thumbKey = `workouts/${id}/${fileId}_t.webp`;
    await this.storage.put(key, photo.large.data, 'image/webp');
    await this.storage.put(thumbKey, photo.thumb.data, 'image/webp');
    await this.prisma.workout.update({ where: { id }, data: { coverKey: key, coverThumbKey: thumbKey, coverUrl: null } });
    await this.storage.delete([w.coverKey, w.coverThumbKey].filter((k): k is string => !!k));
    return this.adminWorkout(id);
  }

  async deleteWorkout(actorId: string, id: string): Promise<void> {
    const w = await this.prisma.workout.findUnique({ where: { id }, select: { isPublished: true, coverKey: true, coverThumbKey: true, _count: { select: { sessions: true } } } });
    if (!w) throw new NotFoundException('Workout not found');
    if (w.isPublished || w._count.sessions > 0) throw new BadRequestException('Unpublish it instead: members have it in their history.');
    await this.prisma.workout.delete({ where: { id } });
    await this.storage.delete([w.coverKey, w.coverThumbKey].filter((k): k is string => !!k));
    await this.audit.record({ action: 'workout.deleted', actorId, targetType: 'workout', targetId: id });
  }

  // ── helpers ──

  private async dropOldMedia(ex: { imageKey: string | null; imageThumbKey: string | null; video: { id: string; provider: string; providerId: string | null; posterKey: string | null } | null }): Promise<void> {
    await this.storage.delete([ex.imageKey, ex.imageThumbKey].filter((k): k is string => !!k));
    if (ex.video) {
      await this.videos.discard(ex.video);
      await this.prisma.videoUpload.delete({ where: { id: ex.video.id } }).catch(() => undefined);
    }
  }

  private async media(r: ExerciseRow): Promise<ExerciseMedia | null> {
    if (r.video) {
      const v = await this.videos.playback(r.video);
      return { type: 'video', url: v.url, thumbUrl: v.thumbUrl };
    }
    if (r.imageKey) return { type: 'image', url: this.storage.publicUrl(r.imageKey), thumbUrl: r.imageThumbKey ? this.storage.publicUrl(r.imageThumbKey) : null };
    if (r.animationUrl) return { type: 'animation', url: r.animationUrl, thumbUrl: null };
    return null;
  }

  private async toExercise(r: ExerciseRow): Promise<ExerciseItem> {
    return {
      id: r.id, name: r.name, bodyPart: r.bodyPart, targetMuscle: r.targetMuscle, secondaryMuscles: r.secondaryMuscles, equipment: r.equipment,
      instructions: r.instructions, tips: r.tips, media: await this.media(r), source: r.source, isActive: r.isActive, usedIn: r._count.workouts,
    };
  }

  private cover(r: WorkoutRow): string | null {
    return r.coverKey ? this.storage.publicUrl(r.coverKey) : r.coverUrl;
  }

  private async toCard(r: WorkoutRow, unlocked: boolean, doneCount: number): Promise<WorkoutCard> {
    const equipment = [...new Set(r.exercises.map((e) => e.exercise.equipment).filter((e): e is string => !!e && e !== 'None'))];
    return {
      id: r.id, title: r.title, level: r.level as WorkoutLevel, goal: r.goal as WorkoutGoal, durationMin: r.durationMin, exerciseCount: r.exercises.length,
      equipment, coverUrl: this.cover(r), isFree: r.isFree, locked: !r.isFree && !unlocked, doneCount,
    };
  }

  private async toDetail(r: WorkoutRow, unlocked: boolean, doneCount: number): Promise<WorkoutDetail> {
    const card = await this.toCard(r, unlocked, doneCount);
    return {
      ...card,
      description: r.description,
      steps: await Promise.all(
        r.exercises.map(async (s) => ({
          exercise: {
            id: s.exercise.id, name: s.exercise.name, bodyPart: s.exercise.bodyPart, equipment: s.exercise.equipment,
            // How-to and demos only once unlocked: the list of moves is the teaser.
            ...(!card.locked && { instructions: s.exercise.instructions, tips: s.exercise.tips, media: await this.media(s.exercise) }),
          },
          sets: s.sets, reps: s.reps, durationSec: s.durationSec, restSec: s.restSec, notes: s.notes,
        })),
      ),
    };
  }

  private async toAdmin(r: WorkoutRow): Promise<AdminWorkout> {
    return { ...(await this.toDetail(r, true, 0)), isPublished: r.isPublished, sessions: r._count.sessions, updatedAt: r.updatedAt.toISOString() };
  }
}
