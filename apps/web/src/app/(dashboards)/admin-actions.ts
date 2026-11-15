'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { feeBpsSchema, percentToBps, reviewGymSchema, suspendGymSchema, type FeeSettings, type GymFee } from '@bgym/shared';
import { api, ApiError } from '@/lib/api.server';

/* BGYM team actions. The API requires the admin role on every call. */

export type AdminActionResult = { error?: string };

const gymId = z.uuid();

async function run(path: string, body?: unknown): Promise<AdminActionResult> {
  try {
    await api<unknown>(path, { method: 'POST', ...(body !== undefined && { body: JSON.stringify(body) }) });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  revalidatePath('/admin', 'layout');
  return {};
}

export async function reviewGym(id: string, decision: 'approve' | 'return', note?: string): Promise<AdminActionResult> {
  const gym = gymId.safeParse(id);
  const input = reviewGymSchema.safeParse({ decision, note: note?.trim() || undefined });
  if (!gym.success || !input.success) return { error: input.success ? 'Unknown gym.' : (input.error.issues[0]?.message ?? 'Check the note.') };
  return run(`/v1/admin/gyms/${gym.data}/review`, input.data);
}

export async function suspendGym(id: string, reason: string): Promise<AdminActionResult> {
  const gym = gymId.safeParse(id);
  const input = suspendGymSchema.safeParse({ reason });
  if (!gym.success || !input.success) return { error: input.success ? 'Unknown gym.' : (input.error.issues[0]?.message ?? 'Give a reason.') };
  return run(`/v1/admin/gyms/${gym.data}/suspend`, input.data);
}

export async function reactivateGym(id: string): Promise<AdminActionResult> {
  const gym = gymId.safeParse(id);
  if (!gym.success) return { error: 'Unknown gym.' };
  return run(`/v1/admin/gyms/${gym.data}/reactivate`);
}

const percentInput = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, 'Enter a percentage like 2 or 2.5')
  .transform((v) => percentToBps(Number(v)))
  .pipe(feeBpsSchema);

export async function saveDefaultFee(percent: string, kind: 'membership' | 'trainer' = 'membership'): Promise<AdminActionResult> {
  const bps = percentInput.safeParse(percent);
  if (!bps.success) return { error: bps.error.issues[0]?.message ?? 'Check the percentage.' };
  const key = kind === 'trainer' ? 'trainerBps' : 'membershipBps';
  try {
    await api<FeeSettings>('/v1/admin/fees', { method: 'PUT', body: JSON.stringify({ [key]: bps.data }) });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  revalidatePath('/admin', 'layout');
  return {};
}

/** percent: '' removes the gym's special rate (it follows the default again). */
export async function saveGymFee(id: string, percent: string): Promise<AdminActionResult> {
  const gym = gymId.safeParse(id);
  if (!gym.success) return { error: 'Unknown gym.' };
  let bps: number | null = null;
  if (percent.trim() !== '') {
    const parsed = percentInput.safeParse(percent);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the percentage.' };
    bps = parsed.data;
  }
  try {
    await api<GymFee>(`/v1/admin/gyms/${gym.data}/fee`, { method: 'PUT', body: JSON.stringify({ bps }) });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  revalidatePath('/admin', 'layout');
  return {};
}

const reportId = z.uuid();

const reportTarget = z.enum(['post', 'comment', 'story']);
const removePath = { post: 'posts', comment: 'comments', story: 'stories' } as const;

export async function removeReported(type: string, targetId: string): Promise<AdminActionResult> {
  const t = reportTarget.safeParse(type);
  const id = reportId.safeParse(targetId);
  if (!t.success || !id.success) return { error: 'Unknown item.' };
  return run(`/v1/admin/${removePath[t.data]}/${id.data}/remove`);
}

export async function dismissReport(id: string): Promise<AdminActionResult> {
  const parsed = reportId.safeParse(id);
  if (!parsed.success) return { error: 'Unknown report.' };
  return run(`/v1/admin/reports/${parsed.data}/dismiss`);
}
