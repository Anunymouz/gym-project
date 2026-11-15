'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  availabilitySchema,
  gymFeeOverrideSchema,
  inviteTrainerSchema,
  MAX_PHOTO_BYTES,
  timeOffSchema,
  trainerPackageSchema,
  trainerProfileSchema,
  updatePayoutSchema,
  type AuthTokens,
  type AvailabilityInput,
  type GymPayout,
  type GymTrainers,
  type TimeOffInput,
  type TrainerAvailability,
  type TrainerBooking,
  type TrainerMe,
  type TrainerPackageInput,
  type TrainerPackageItem,
  type TrainerProfileInput,
  type UpdatePayoutInput,
} from '@bgym/shared';
import { api, ApiError, apiUpload, publicApi } from '@/lib/api.server';
import { COOKIE, writeSession } from '@/lib/auth/cookies';
import { getCurrentGym } from '@/lib/session.server';

type Result<T> = { data?: T; error?: string; fieldErrors?: Record<string, string> };
const id = z.uuid();

async function call<T>(fn: () => Promise<T>, revalidate = '/trainer'): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath(revalidate, 'layout');
    return { data };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' };
  }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.map(String).join('.') || 'form'] ??= issue.message;
  return out;
}

// ── Invitations (the invited person, on the gym dashboard) ──

/**
 * Accepts or declines. Accepting gives the person the trainer role, so the session is renewed
 * right away (roles live in the access token) and they're taken to their new dashboard.
 */
export async function respondToTrainerInvitation(invitationId: string, accept: boolean): Promise<{ error?: string }> {
  const parsed = id.safeParse(invitationId);
  if (!parsed.success) return { error: 'Invitation not found.' };
  try {
    await api(`/v1/me/trainer-invitations/${parsed.data}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  if (!accept) {
    revalidatePath('/gym', 'layout');
    return {};
  }
  const store = await cookies();
  const refreshToken = store.get(COOKIE.refresh)?.value;
  if (refreshToken) {
    const tokens = await publicApi<AuthTokens>('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => null);
    if (tokens) writeSession(store, tokens);
  }
  redirect('/trainer');
}

// ── Trainer profile ──

export async function saveTrainerProfile(input: TrainerProfileInput): Promise<Result<TrainerMe>> {
  const parsed = trainerProfileSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  return call(() => api<TrainerMe>('/v1/trainer/me', { method: 'PUT', body: JSON.stringify(parsed.data) }));
}

export async function uploadTrainerPhoto(form: FormData): Promise<Result<TrainerMe>> {
  const photo = form.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return { error: 'Choose a photo.' };
  if (photo.size > MAX_PHOTO_BYTES) return { error: 'That photo is too big (10 MB at most).' };
  const out = new FormData();
  out.append('photo', photo, 'photo');
  return call(() => apiUpload<TrainerMe>('/v1/trainer/me/photo', out));
}

export async function setTrainerListed(listed: boolean): Promise<Result<TrainerMe>> {
  return call(() => api<TrainerMe>('/v1/trainer/me/listed', { method: 'PUT', body: JSON.stringify({ listed: listed === true }) }));
}

// ── Availability ──

export async function saveAvailability(input: AvailabilityInput): Promise<Result<TrainerAvailability>> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the hours.' };
  return call(() => api<TrainerAvailability>('/v1/trainer/availability', { method: 'PUT', body: JSON.stringify(parsed.data) }));
}

export async function addTimeOff(input: TimeOffInput): Promise<Result<TrainerAvailability>> {
  const parsed = timeOffSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the date.' };
  return call(() => api<TrainerAvailability>('/v1/trainer/time-off', { method: 'POST', body: JSON.stringify(parsed.data) }));
}

export async function removeTimeOff(timeOffId: string): Promise<Result<TrainerAvailability>> {
  const parsed = id.safeParse(timeOffId);
  if (!parsed.success) return { error: 'Not found.' };
  return call(() => api<TrainerAvailability>(`/v1/trainer/time-off/${parsed.data}`, { method: 'DELETE' }));
}

// ── Packages ──

export async function createTrainerPackage(input: TrainerPackageInput): Promise<Result<TrainerPackageItem[]>> {
  const parsed = trainerPackageSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  return call(() => api<TrainerPackageItem[]>('/v1/trainer/packages', { method: 'POST', body: JSON.stringify(parsed.data) }));
}

export async function setPackageActive(packageId: string, isActive: boolean): Promise<Result<TrainerPackageItem[]>> {
  const parsed = id.safeParse(packageId);
  if (!parsed.success) return { error: 'Package not found.' };
  return call(() => api<TrainerPackageItem[]>(`/v1/trainer/packages/${parsed.data}`, { method: 'PATCH', body: JSON.stringify({ isActive: isActive === true }) }));
}

// ── Bookings ──

export async function actOnBooking(bookingId: string, action: 'complete' | 'no_show' | 'cancel'): Promise<Result<TrainerBooking>> {
  const parsed = id.safeParse(bookingId);
  const act = z.enum(['complete', 'no_show', 'cancel']).safeParse(action);
  if (!parsed.success || !act.success) return { error: 'Booking not found.' };
  return call(() => api<TrainerBooking>(`/v1/trainer/bookings/${parsed.data}`, { method: 'POST', body: JSON.stringify({ action: act.data }) }));
}

// ── Payout ──

export async function requestTrainerPayoutCode(): Promise<{ error?: string }> {
  try {
    await api<void>('/v1/trainer/payout/code', { method: 'POST' });
    return {};
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}

export async function saveTrainerPayout(input: UpdatePayoutInput): Promise<{ saved?: GymPayout; error?: string; fieldErrors?: Record<string, string> }> {
  const parsed = updatePayoutSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    const saved = await api<GymPayout>('/v1/trainer/payout', { method: 'PUT', body: JSON.stringify(parsed.data) });
    revalidatePath('/trainer', 'layout');
    return { saved };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}

// ── Gym: its trainers ──

async function requireGymManager() {
  const gym = await getCurrentGym();
  if (!gym) throw new Error('No gym');
  return gym;
}

export async function inviteTrainer(email: string): Promise<Result<GymTrainers>> {
  const gym = await requireGymManager();
  const parsed = inviteTrainerSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return call(() => api<GymTrainers>(`/v1/staff/gyms/${gym.id}/trainer-invitations`, { method: 'POST', body: JSON.stringify(parsed.data) }), '/gym/trainers');
}

export async function cancelTrainerInvitation(invitationId: string): Promise<Result<GymTrainers>> {
  const gym = await requireGymManager();
  const parsed = id.safeParse(invitationId);
  if (!parsed.success) return { error: 'Invitation not found.' };
  return call(() => api<GymTrainers>(`/v1/staff/gyms/${gym.id}/trainer-invitations/${parsed.data}`, { method: 'DELETE' }), '/gym/trainers');
}

export async function removeTrainer(trainerId: string): Promise<Result<GymTrainers>> {
  const gym = await requireGymManager();
  const parsed = id.safeParse(trainerId);
  if (!parsed.success) return { error: 'Trainer not found.' };
  return call(() => api<GymTrainers>(`/v1/staff/gyms/${gym.id}/trainers/${parsed.data}/remove`, { method: 'POST' }), '/gym/trainers');
}

// ── BGYM team ──

export async function adminTrainerAction(trainerId: string, action: 'suspend' | 'reactivate'): Promise<Result<void>> {
  const parsed = id.safeParse(trainerId);
  const act = z.enum(['suspend', 'reactivate']).safeParse(action);
  if (!parsed.success || !act.success) return { error: 'Trainer not found.' };
  return call(() => api<void>(`/v1/admin/trainers/${parsed.data}/${act.data}`, { method: 'POST' }), '/admin/trainers');
}

export async function setTrainerFee(trainerId: string, percent: number | null): Promise<Result<void>> {
  const parsed = id.safeParse(trainerId);
  const bps = gymFeeOverrideSchema.safeParse({ bps: percent === null ? null : Math.round(percent * 100) });
  if (!parsed.success) return { error: 'Trainer not found.' };
  if (!bps.success) return { error: bps.error.issues[0]?.message };
  return call(() => api<void>(`/v1/admin/trainers/${parsed.data}/fee`, { method: 'PUT', body: JSON.stringify(bps.data) }), '/admin/trainers');
}
