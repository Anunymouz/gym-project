'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { firstNameSchema, lastNameSchema } from '@bgym/shared';
import { api, ApiError, publicApi } from '@/lib/api.server';
import { COOKIE, clearSession, rememberGym } from '@/lib/auth/cookies';
import { getStaffGyms } from '@/lib/session.server';

export async function signOut(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(COOKIE.refresh)?.value;
  if (refreshToken) {
    // Revoke the session on the server; sign out locally even if the API is unreachable.
    await publicApi('/v1/auth/sign-out', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  }
  clearSession(store);
  redirect('/sign-in');
}

export async function switchGym(form: FormData): Promise<void> {
  const gymId = z.uuid().safeParse(form.get('gymId'));
  if (!gymId.success) return;
  // Only remember a gym this person actually works at.
  const gyms = await getStaffGyms();
  if (!gyms.some((g) => g.id === gymId.data)) return;
  rememberGym(await cookies(), gymId.data);
  redirect('/gym');
}

/** Accepts or declines a staff invitation for the signed-in person (the API checks it's theirs). */
export async function respondToInvitation(invitationId: string, accept: boolean, name?: { firstName: string; lastName: string }): Promise<{ error?: string }> {
  const id = z.uuid().safeParse(invitationId);
  if (!id.success) return { error: 'Invitation not found.' };
  // People who signed up on the dashboard may not have a name yet; their new team needs one.
  if (accept && name !== undefined) {
    const parsed = z.object({ firstName: firstNameSchema, lastName: lastNameSchema }).safeParse(name);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter your name.' };
    try {
      await api('/v1/auth/me', { method: 'PATCH', body: JSON.stringify(parsed.data) });
    } catch (err) {
      return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
    }
  }
  let gymId: string;
  try {
    gymId = (await api<{ gymId: string }>(`/v1/me/invitations/${id.data}/${accept ? 'accept' : 'decline'}`, { method: 'POST' })).gymId;
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  if (accept) rememberGym(await cookies(), gymId); // open the gym they just joined
  revalidatePath('/gym', 'layout');
  return {};
}
