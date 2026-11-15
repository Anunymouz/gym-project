import { z } from 'zod';

export const WORKOUT_LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
export type WorkoutLevel = keyof typeof WORKOUT_LEVELS;
export const WORKOUT_GOALS = { strength: 'Build strength', fat_loss: 'Burn fat', core: 'Core', mobility: 'Mobility & stretching', cardio: 'Cardio' } as const;
export type WorkoutGoal = keyof typeof WORKOUT_GOALS;
export const BODY_PARTS = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes', core: 'Core', full_body: 'Full body', cardio: 'Cardio' } as const;
export type BodyPart = keyof typeof BODY_PARTS;
export const EQUIPMENT = ['None', 'Dumbbells', 'Barbell', 'Kettlebell', 'Resistance band', 'Bench', 'Pull-up bar', 'Mat', 'Machine', 'Cable'] as const;
/** A demo video for an exercise can be up to this long. */
export const MAX_EXERCISE_VIDEO_SECONDS = 60;

const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);
const line = z.string().trim().min(3).max(300);

// ── Exercise library (admin) ──
export const exerciseInputSchema = z.object({
  name: z.string().trim().min(2, 'Name the exercise').max(80),
  bodyPart: enumOf(BODY_PARTS),
  targetMuscle: z.string().trim().max(60).optional(),
  secondaryMuscles: z.array(z.string().trim().min(2).max(40)).max(6).default([]),
  equipment: z.string().trim().max(40).optional(),
  instructions: z.array(line).min(1, 'Add at least one step').max(10),
  tips: z.array(line).max(5).default([]),
});
export type ExerciseInput = z.input<typeof exerciseInputSchema>;

/** Import from a licensed library export (or a spreadsheet turned into JSON). Up to 500 at a time. */
export const exerciseImportSchema = z.object({
  source: z.string().trim().regex(/^[a-z0-9-]{2,30}$/, 'Use a short source name, like exercisedb'),
  exercises: z
    .array(
      z.object({
        externalId: z.string().trim().min(1).max(80),
        name: z.string().trim().min(2).max(80),
        bodyPart: z.string().trim().min(2).max(40),
        targetMuscle: z.string().trim().max(60).optional(),
        secondaryMuscles: z.array(z.string().trim().max(40)).max(10).optional(),
        equipment: z.string().trim().max(40).optional(),
        instructions: z.array(z.string().trim().min(1).max(500)).max(15).default([]),
        animationUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type ExerciseImport = z.infer<typeof exerciseImportSchema>;

export interface ExerciseMedia {
  type: 'image' | 'video' | 'animation';
  url: string;
  thumbUrl: string | null;
}

export interface ExerciseItem {
  id: string;
  name: string;
  bodyPart: string;
  targetMuscle: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  instructions: string[];
  tips: string[];
  media: ExerciseMedia | null;
  source: string;
  isActive: boolean;
  usedIn: number;
}

// ── Workouts (admin builder) ──
export const workoutStepSchema = z
  .object({
    exerciseId: z.uuid(),
    sets: z.number().int().min(1).max(20).nullable().optional(),
    reps: z.number().int().min(1).max(200).nullable().optional(),
    durationSec: z.number().int().min(5).max(3600).nullable().optional(),
    restSec: z.number().int().min(0).max(600).nullable().optional(),
    notes: z.string().trim().max(200).optional(),
  })
  .refine((s) => !!s.reps !== !!s.durationSec, { message: 'Each exercise needs reps or a time (not both)' });

export const workoutInputSchema = z.object({
  title: z.string().trim().min(3, 'Give the workout a name').max(80),
  description: z.string().trim().max(1000).optional(),
  level: enumOf(WORKOUT_LEVELS),
  goal: enumOf(WORKOUT_GOALS),
  isFree: z.boolean(),
  steps: z.array(workoutStepSchema).min(1, 'Add at least one exercise').max(30),
});
export type WorkoutInput = z.infer<typeof workoutInputSchema>;

export interface WorkoutStep {
  exercise: {
    id: string;
    name: string;
    bodyPart: string;
    equipment: string | null;
    /** Only when the workout is unlocked for the viewer. */
    instructions?: string[];
    tips?: string[];
    media?: ExerciseMedia | null;
  };
  sets: number | null;
  reps: number | null;
  durationSec: number | null;
  restSec: number | null;
  notes: string | null;
}

export interface WorkoutCard {
  id: string;
  title: string;
  level: WorkoutLevel;
  goal: WorkoutGoal;
  durationMin: number;
  exerciseCount: number;
  equipment: string[];
  coverUrl: string | null;
  isFree: boolean;
  /** Free, or the viewer has an active membership at any gym. */
  locked: boolean;
  /** How many times the viewer has finished it. */
  doneCount: number;
}

export interface WorkoutDetail extends WorkoutCard {
  description: string | null;
  steps: WorkoutStep[];
}

export interface AdminWorkout extends WorkoutDetail {
  isPublished: boolean;
  sessions: number;
  updatedAt: string;
}

// ── Sessions and history ──
export const completeSessionSchema = z.object({
  durationSec: z.number().int().min(0).max(4 * 3600),
  exercisesCompleted: z.number().int().min(0).max(30),
  effort: z.number().int().min(1).max(5).optional(),
});
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

export interface WorkoutStats {
  thisWeek: number;
  /** Days in a row (ending today or yesterday) with a finished workout. */
  streakDays: number;
  totalWorkouts: number;
  totalMinutes: number;
}

export interface WorkoutHistoryItem {
  id: string;
  workout: { id: string; title: string; coverUrl: string | null };
  completedAt: string;
  durationSec: number;
  exercisesCompleted: number;
  exercisesTotal: number;
  effort: number | null;
}

export interface WorkoutsHome {
  unlocked: boolean;
  stats: WorkoutStats;
  workouts: WorkoutCard[];
}

/** Rough seconds per rep, for the estimated length of a workout. */
const SECONDS_PER_REP = 3;

/** Sets × (reps × ~3 s, or the time) plus rest, rounded up to whole minutes. */
export function estimateWorkoutMinutes(steps: ReadonlyArray<{ sets?: number | null; reps?: number | null; durationSec?: number | null; restSec?: number | null }>): number {
  const seconds = steps.reduce((sum, s) => {
    const sets = s.sets ?? 1;
    const work = s.reps ? s.reps * SECONDS_PER_REP : (s.durationSec ?? 0);
    return sum + sets * (work + (s.restSec ?? 0));
  }, 0);
  return Math.max(1, Math.ceil(seconds / 60));
}
