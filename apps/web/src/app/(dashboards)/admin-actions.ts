'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { reviewGymSchema, suspendGymSchema, type AdminGym } from '@bgym/shared';
import { api, ApiError } from '@/lib/api.server';

/* BGYM team actions. The API requires the admin role on every call. */

export type AdminActionResult = { error?: string };

const gymId = z.uuid();

async function run(path: string, body?: unknown): Promise<AdminActionResult> {
  try {
    await api<AdminGym>(path, { method: 'POST', ...(body !== undefined && { body: JSON.stringify(body) }) });
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
