'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { publicApi } from '@/lib/api.server';
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
