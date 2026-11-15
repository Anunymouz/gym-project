'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  checkInByEmailSchema,
  createPlanSchema,
  updateGymProfileSchema,
  updatePayoutSchema,
  updatePlanSchema,
  type CheckInResponse,
  type GymPayout,
  type GymProfile,
  type GymReadiness,
  type RemindResponse,
  type StaffPlan,
  type UpdateGymProfileInput,
  type UpdatePayoutInput,
} from '@bgym/shared';
import { api, ApiError } from '@/lib/api.server';
import { getCurrentGym } from '@/lib/session.server';

/*
 * Gym dashboard mutations. The gym is always the one resolved on the server from the
 * person's own staff list, never an id sent by the browser, and the API re-checks the
 * person's role at that gym on every call.
 */

type PlanField = 'name' | 'description' | 'durationDays' | 'price';
/** `values` echoes what was typed, so the form keeps it after a failed save (React resets forms after an action). */
export type PlanFormState = { ok?: boolean; error?: string; fieldErrors?: Partial<Record<PlanField, string>>; values?: Record<PlanField, string> };

function typed(form: FormData): Record<PlanField, string> {
  const get = (k: string) => String(form.get(k) ?? '').slice(0, 200);
  return { name: get('name'), description: get('description'), durationDays: get('durationDays'), price: get('price') };
}

function planInput(form: FormData) {
  const cedis = String(form.get('price') ?? '').replace(/[,\s]/g, '');
  const price = /^\d+(\.\d{1,2})?$/.test(cedis) ? Math.round(Number(cedis) * 100) : NaN;
  const description = String(form.get('description') ?? '').trim();
  return { name: form.get('name'), description: description || null, durationDays: form.get('durationDays'), pricePesewas: price };
}

function fieldErrors(error: z.ZodError): PlanFormState['fieldErrors'] {
  const out: NonNullable<PlanFormState['fieldErrors']> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] === 'pricePesewas' ? 'price' : (issue.path[0] as keyof typeof out);
    out[key] ??= key === 'price' && issue.code === 'invalid_type' ? 'Enter a price like 350 or 350.00' : issue.message;
  }
  return out;
}

async function requireGym() {
  const gym = await getCurrentGym();
  if (!gym) throw new Error('No gym');
  return gym;
}

export async function savePlan(_prev: PlanFormState, form: FormData): Promise<PlanFormState> {
  const gym = await requireGym();
  const planId = form.get('planId');
  const parsed = createPlanSchema.safeParse(planInput(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: typed(form) };
  try {
    if (typeof planId === 'string' && planId) {
      const id = z.uuid().parse(planId);
      await api<StaffPlan>(`/v1/staff/gyms/${gym.id}/plans/${id}`, { method: 'PATCH', body: JSON.stringify(parsed.data) });
    } else {
      await api<StaffPlan>(`/v1/staff/gyms/${gym.id}/plans`, { method: 'POST', body: JSON.stringify(parsed.data) });
    }
  } catch (err) {
    return { values: typed(form), error: err instanceof ApiError ? (err.status === 403 ? 'Only owners and managers can change plans.' : err.message) : 'Something went wrong.' };
  }
  revalidatePath('/gym/plans');
  return { ok: true };
}

export async function setPlanActive(form: FormData): Promise<void> {
  const gym = await requireGym();
  const id = z.uuid().parse(form.get('planId'));
  const body = updatePlanSchema.parse({ isActive: form.get('isActive') === 'true' });
  await api<StaffPlan>(`/v1/staff/gyms/${gym.id}/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  revalidatePath('/gym/plans');
}

export type CheckInResult = CheckInResponse | { result: 'error'; message: string };

const token = z.string().min(20).max(2000);

/** Checks a scanned member pass in at the current gym. */
export async function checkInPass(raw: string): Promise<CheckInResult> {
  const gym = await requireGym();
  const parsed = token.safeParse(raw.trim());
  if (!parsed.success) return { result: 'invalid', member: null, plan: null, endsAt: null };
  return post('/v1/check-ins', { gymId: gym.id, token: parsed.data });
}

/** Front-desk fallback when a member's phone can't show the pass. */
export async function checkInEmail(email: string): Promise<CheckInResult> {
  const gym = await requireGym();
  const parsed = checkInByEmailSchema.safeParse({ gymId: gym.id, email });
  if (!parsed.success) return { result: 'error', message: 'Enter a valid email address.' };
  return post('/v1/check-ins/by-email', parsed.data);
}

async function post(path: string, body: unknown): Promise<CheckInResult> {
  try {
    return await api<CheckInResponse>(path, { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    return { result: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' };
  }
}

export type RemindResult = { ok: true } | { ok: false; error: string };

/** Emails a member a renewal reminder now (the API allows one per membership per day). */
export async function remindMember(membershipId: string): Promise<RemindResult> {
  const gym = await requireGym();
  const id = z.uuid().safeParse(membershipId);
  if (!id.success) return { ok: false, error: 'Membership not found.' };
  try {
    await api<RemindResponse>(`/v1/staff/gyms/${gym.id}/memberships/${id.data}/remind`, { method: 'POST' });
  } catch (err) {
    return { ok: false, error: err instanceof ApiError && err.status !== 429 ? err.message : err instanceof ApiError ? 'Already reminded today.' : 'Could not send. Try again.' };
  }
  revalidatePath('/gym', 'layout');
  return { ok: true };
}

export type GymProfileState = { ok?: boolean; saved?: GymProfile; error?: string; fieldErrors?: Record<string, string> };

/** Saves the gym's public profile (owners and managers; the API checks the role). */
export async function saveGymProfile(input: UpdateGymProfileInput): Promise<GymProfileState> {
  const gym = await requireGym();
  const parsed = updateGymProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] ??= issue.message;
    return { fieldErrors, error: 'Check the highlighted fields.' };
  }
  let saved: GymProfile;
  try {
    saved = await api<GymProfile>(`/v1/staff/gyms/${gym.id}/profile`, { method: 'PATCH', body: JSON.stringify(parsed.data) });
  } catch (err) {
    return { error: err instanceof ApiError ? (err.status === 403 ? 'Only owners and managers can change the gym’s details.' : err.message) : 'Something went wrong.' };
  }
  revalidatePath('/gym', 'layout');
  return { ok: true, saved };
}

/** Sends the gym to the BGYM team for review (owners only; the API checks). */
export async function submitGymForReview(): Promise<{ error?: string }> {
  const gym = await requireGym();
  try {
    await api<GymReadiness>(`/v1/staff/gyms/${gym.id}/submit`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? (err.status === 403 ? 'Only the gym owner can send it for review.' : err.message) : 'Something went wrong.' };
  }
  revalidatePath('/gym', 'layout');
  return {};
}

/** Emails the owner a code to confirm a payout change. */
export async function requestPayoutCode(): Promise<{ error?: string }> {
  const gym = await requireGym();
  try {
    await api<void>(`/v1/staff/gyms/${gym.id}/payout/code`, { method: 'POST' });
    return {};
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}

export type PayoutState = { saved?: GymPayout; error?: string; fieldErrors?: Record<string, string> };

export async function savePayout(input: UpdatePayoutInput): Promise<PayoutState> {
  const gym = await requireGym();
  const parsed = updatePayoutSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  try {
    const saved = await api<GymPayout>(`/v1/staff/gyms/${gym.id}/payout`, { method: 'PUT', body: JSON.stringify(parsed.data) });
    revalidatePath('/gym', 'layout');
    return { saved };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}
