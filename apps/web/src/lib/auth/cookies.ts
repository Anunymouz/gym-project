import type { AuthTokens } from '@bgym/shared';

/**
 * Session cookies. Tokens never reach browser JavaScript: they are httpOnly and only the
 * dashboard's server reads them. In production they are Secure and use the __Host- prefix
 * (locked to this exact host, HTTPS only, path=/).
 */
const prod = process.env.NODE_ENV === 'production';
const prefix = prod ? '__Host-' : '';

export const COOKIE = {
  access: `${prefix}bgym_at`,
  accessExpiry: `${prefix}bgym_at_exp`,
  refresh: `${prefix}bgym_rt`,
  gym: `${prefix}bgym_gym`,
} as const;

const base = { httpOnly: true, secure: prod, sameSite: 'lax' as const, path: '/' };
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

type CookieWriter = { set: (name: string, value: string, options: typeof base & { maxAge: number }) => unknown };

export function writeSession(store: CookieWriter, tokens: AuthTokens): void {
  const expiresAt = Date.parse(tokens.accessTokenExpiresAt);
  const accessMaxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  store.set(COOKIE.access, tokens.accessToken, { ...base, maxAge: accessMaxAge });
  store.set(COOKIE.accessExpiry, String(expiresAt), { ...base, maxAge: accessMaxAge });
  store.set(COOKIE.refresh, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}

export function clearSession(store: { delete: (name: string) => unknown }): void {
  for (const name of [COOKIE.access, COOKIE.accessExpiry, COOKIE.refresh, COOKIE.gym]) store.delete(name);
}

export function rememberGym(store: CookieWriter, gymId: string): void {
  store.set(COOKIE.gym, gymId, { ...base, maxAge: REFRESH_MAX_AGE });
}
