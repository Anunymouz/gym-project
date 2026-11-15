'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  exerciseImportSchema,
  exerciseInputSchema,
  MAX_PHOTO_BYTES,
  workoutInputSchema,
  type AdminWorkout,
  type ExerciseInput,
  type ExerciseItem,
  type VideoUploadStatus,
  type VideoUploadTicket,
  type WorkoutInput,
} from '@bgym/shared';
import { api, ApiError, apiUpload } from '@/lib/api.server';

/** The BGYM team's workout library. The API checks the admin role on every request. */
const id = z.uuid();
type Result<T> = { data?: T; error?: string; fieldErrors?: Record<string, string> };

async function call<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath('/admin/workouts', 'layout');
    return { data };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' };
  }
}

function errorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.map(String).join('.') || 'form'] ??= issue.message;
  return out;
}

function photoForm(form: FormData): FormData | string {
  const photo = form.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return 'Choose a photo.';
  if (photo.size > MAX_PHOTO_BYTES) return 'That photo is too big (10 MB at most).';
  const out = new FormData();
  out.append('photo', photo, 'photo');
  return out;
}

// ── Exercises ──

export async function saveExercise(exerciseId: string | null, input: ExerciseInput): Promise<Result<ExerciseItem>> {
  const parsed = exerciseInputSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };
  if (exerciseId && !id.safeParse(exerciseId).success) return { error: 'Exercise not found.' };
  return call(() => api<ExerciseItem>(exerciseId ? `/v1/admin/exercises/${exerciseId}` : '/v1/admin/exercises', { method: exerciseId ? 'PUT' : 'POST', body: JSON.stringify(parsed.data) }));
}

export async function setExerciseActive(exerciseId: string, isActive: boolean): Promise<Result<ExerciseItem>> {
  if (!id.safeParse(exerciseId).success || typeof isActive !== 'boolean') return { error: 'Exercise not found.' };
  return call(() => api<ExerciseItem>(`/v1/admin/exercises/${exerciseId}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }));
}

export async function uploadExercisePhoto(exerciseId: string, form: FormData): Promise<Result<ExerciseItem>> {
  if (!id.safeParse(exerciseId).success) return { error: 'Exercise not found.' };
  const out = photoForm(form);
  if (typeof out === 'string') return { error: out };
  return call(() => apiUpload<ExerciseItem>(`/v1/admin/exercises/${exerciseId}/photo`, out));
}

export async function attachExerciseVideo(exerciseId: string, videoId: string): Promise<Result<ExerciseItem>> {
  if (!id.safeParse(exerciseId).success || !id.safeParse(videoId).success) return { error: 'Exercise not found.' };
  return call(() => api<ExerciseItem>(`/v1/admin/exercises/${exerciseId}/video`, { method: 'POST', body: JSON.stringify({ videoId }) }));
}

export async function clearExerciseMedia(exerciseId: string): Promise<Result<ExerciseItem>> {
  if (!id.safeParse(exerciseId).success) return { error: 'Exercise not found.' };
  return call(() => api<ExerciseItem>(`/v1/admin/exercises/${exerciseId}/media`, { method: 'DELETE' }));
}

/** A JSON export from a licensed exercise library (pasted or read from a file in the browser). */
export async function importExercises(json: string): Promise<Result<{ created: number; updated: number }>> {
  if (typeof json !== 'string' || json.length > 2_000_000) return { error: 'That file is too big: import up to 500 exercises at a time.' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { error: 'That isn’t valid JSON.' };
  }
  const parsed = exerciseImportSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join('.') || 'File'}: ${first.message}` : 'Check the file format.' };
  }
  return call(() => api<{ created: number; updated: number }>('/v1/admin/exercises/import', { method: 'POST', body: JSON.stringify(parsed.data) }));
}

export async function startExerciseVideo(): Promise<{ ticket?: VideoUploadTicket; error?: string }> {
  try {
    return { ticket: await api<VideoUploadTicket>('/v1/videos', { method: 'POST', body: JSON.stringify({ purpose: 'exercise' }) }) };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Couldn’t start the upload.' };
  }
}

export async function exerciseVideoStatus(videoId: string): Promise<{ status?: VideoUploadStatus; error?: string }> {
  if (!id.safeParse(videoId).success) return { error: 'Unknown upload.' };
  try {
    return { status: await api<VideoUploadStatus>(`/v1/videos/${videoId}`) };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Couldn’t check the upload.' };
  }
}

// ── Workouts ──

export async function saveWorkout(workoutId: string | null, input: WorkoutInput): Promise<Result<AdminWorkout>> {
  const parsed = workoutInputSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };
  if (workoutId && !id.safeParse(workoutId).success) return { error: 'Workout not found.' };
  return call(() => api<AdminWorkout>(workoutId ? `/v1/admin/workouts/${workoutId}` : '/v1/admin/workouts', { method: workoutId ? 'PUT' : 'POST', body: JSON.stringify(parsed.data) }));
}

export async function publishWorkout(workoutId: string, isPublished: boolean): Promise<Result<AdminWorkout>> {
  if (!id.safeParse(workoutId).success || typeof isPublished !== 'boolean') return { error: 'Workout not found.' };
  return call(() => api<AdminWorkout>(`/v1/admin/workouts/${workoutId}/publish`, { method: 'PATCH', body: JSON.stringify({ isPublished }) }));
}

export async function uploadWorkoutCover(workoutId: string, form: FormData): Promise<Result<AdminWorkout>> {
  if (!id.safeParse(workoutId).success) return { error: 'Workout not found.' };
  const out = photoForm(form);
  if (typeof out === 'string') return { error: out };
  return call(() => apiUpload<AdminWorkout>(`/v1/admin/workouts/${workoutId}/cover`, out));
}

export async function deleteWorkout(workoutId: string): Promise<Result<true>> {
  if (!id.safeParse(workoutId).success) return { error: 'Workout not found.' };
  return call(async () => {
    await api<void>(`/v1/admin/workouts/${workoutId}`, { method: 'DELETE' });
    return true as const;
  });
}
