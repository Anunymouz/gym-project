'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { applyGymSchema, firstNameSchema, lastNameSchema, type ApplyGymInput, type AuthUser, type GymApplicationResponse } from '@bgym/shared';
import { api, ApiError } from '@/lib/api.server';
import { rememberGym } from '@/lib/auth/cookies';

export type ApplyState = { error?: string; fieldErrors?: Record<string, string> };

/** `ownerName` is asked for when the person's account has no name yet (the BGYM team needs to know who they're dealing with). */
export async function applyForGym(input: ApplyGymInput, ownerName?: { firstName: string; lastName: string }): Promise<ApplyState> {
  const parsed = applyGymSchema.safeParse(input);
  const name = ownerName === undefined ? null : z.object({ firstName: firstNameSchema, lastName: lastNameSchema }).safeParse(ownerName);
  if (!parsed.success || (name && !name.success)) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    for (const issue of name && !name.success ? name.error.issues : []) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, error: 'Check the highlighted fields.' };
  }
  if (name?.success) {
    try {
      await api<AuthUser>('/v1/auth/me', { method: 'PATCH', body: JSON.stringify(name.data) });
    } catch (err) {
      return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
    }
  }
  let created: GymApplicationResponse;
  try {
    created = await api<GymApplicationResponse>('/v1/gyms/applications', { method: 'POST', body: JSON.stringify(parsed.data) });
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  // Open the new gym's dashboard, where the setup checklist continues.
  rememberGym(await cookies(), created.id);
  redirect('/gym');
}
