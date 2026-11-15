import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { AuthUser, StaffGym } from '@bgym/shared';
import { api } from './api.server';
import { COOKIE } from './auth/cookies';

/**
 * Data access for the signed-in person. Each helper is memoised per request with React's
 * cache(), so a layout and a page can both ask without calling the API twice. Authorisation
 * is always decided by the API; these only shape what the dashboard shows.
 */
export const getMe = cache(() => api<AuthUser>('/v1/auth/me'));

export const getStaffGyms = cache(() => api<StaffGym[]>('/v1/staff/gyms'));

/** The gym the person is working in: the one they last picked, else their first. */
export const getCurrentGym = cache(async (): Promise<StaffGym | null> => {
  const [gyms, store] = await Promise.all([getStaffGyms(), cookies()]);
  const picked = store.get(COOKIE.gym)?.value;
  return gyms.find((g) => g.id === picked) ?? gyms[0] ?? null;
});

export const canManagePlans = (gym: StaffGym) => gym.role === 'owner' || gym.role === 'manager';
