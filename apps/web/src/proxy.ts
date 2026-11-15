import { NextResponse, type NextRequest } from 'next/server';
import type { AuthTokens } from '@bgym/shared';
import { API_URL, visitorHeaders } from './lib/api-config';
import { COOKIE, clearSession, writeSession } from './lib/auth/cookies';

const REFRESH_EARLY_MS = 2 * 60 * 1000;

/** Role needed for each dashboard other than the gym one (admins can open them all). */
const DASHBOARD_ROLE: Record<string, string> = { trainer: 'trainer', partner: 'partner', admin: 'admin' };

/**
 * Roles from the access token, used only to route people to a dashboard they have. The
 * token is not verified here (this server doesn't hold the signing key): the API verifies it
 * and checks roles on every request, so a forged token gets a page with no data, never data.
 */
function rolesIn(accessToken: string | undefined): string[] {
  try {
    const payload = JSON.parse(atob(accessToken!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { roles?: unknown };
    return Array.isArray(payload.roles) ? payload.roles.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

/** Sends people who don't have this dashboard's role to the gym dashboard. */
function withRoleCheck(request: NextRequest, accessToken: string | undefined, response: NextResponse): NextResponse {
  const needed = DASHBOARD_ROLE[request.nextUrl.pathname.split('/')[1] ?? ''];
  if (!needed) return response;
  const roles = rolesIn(accessToken);
  if (roles.includes(needed) || roles.includes('admin')) return response;
  const redirect = NextResponse.redirect(new URL('/gym', request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie); // keep a just-refreshed session
  return redirect;
}

/**
 * Runs before every dashboard page: signed-out visitors go to sign-in, and a session whose
 * access token is about to expire is renewed here (the only place, besides server actions,
 * where cookies can be written), so pages always render with a valid token.
 */
export async function proxy(request: NextRequest) {
  const expiresAt = Number(request.cookies.get(COOKIE.accessExpiry)?.value ?? 0);
  const hasAccess = request.cookies.has(COOKIE.access);
  if (hasAccess && expiresAt - Date.now() > REFRESH_EARLY_MS) return withRoleCheck(request, request.cookies.get(COOKIE.access)?.value, NextResponse.next());

  const refreshToken = request.cookies.get(COOKIE.refresh)?.value;
  if (!refreshToken) return toSignIn(request);

  let tokens: AuthTokens;
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...visitorHeaders(request.headers.get('x-forwarded-for')) },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return toSignIn(request, true);
    tokens = (await res.json()) as AuthTokens;
  } catch {
    // API unreachable: keep the current (still valid) token if there is one, rather than signing out.
    return hasAccess && expiresAt > Date.now() ? withRoleCheck(request, request.cookies.get(COOKIE.access)?.value, NextResponse.next()) : toSignIn(request);
  }

  // Make the new tokens visible to this same request's render, and store them in the browser.
  request.cookies.set(COOKIE.access, tokens.accessToken);
  request.cookies.set(COOKIE.accessExpiry, String(Date.parse(tokens.accessTokenExpiresAt)));
  request.cookies.set(COOKIE.refresh, tokens.refreshToken);
  const response = NextResponse.next({ request: { headers: request.headers } });
  writeSession(response.cookies, tokens);
  return withRoleCheck(request, tokens.accessToken, response);
}

function toSignIn(request: NextRequest, clear = false) {
  const url = new URL('/sign-in', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  if (clear) clearSession(response.cookies);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/(gym|trainer|partner|admin|apply)/:path*',
      // Skip link prefetches: only real navigations may rotate the refresh token.
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
