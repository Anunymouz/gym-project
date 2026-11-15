import { NextResponse, type NextRequest } from 'next/server';
import type { AuthTokens } from '@bgym/shared';
import { API_URL, visitorHeaders } from './lib/api-config';
import { COOKIE, clearSession, writeSession } from './lib/auth/cookies';

const REFRESH_EARLY_MS = 2 * 60 * 1000;

/**
 * Runs before every dashboard page: signed-out visitors go to sign-in, and a session whose
 * access token is about to expire is renewed here (the only place, besides server actions,
 * where cookies can be written), so pages always render with a valid token.
 */
export async function proxy(request: NextRequest) {
  const expiresAt = Number(request.cookies.get(COOKIE.accessExpiry)?.value ?? 0);
  const hasAccess = request.cookies.has(COOKIE.access);
  if (hasAccess && expiresAt - Date.now() > REFRESH_EARLY_MS) return NextResponse.next();

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
    return hasAccess && expiresAt > Date.now() ? NextResponse.next() : toSignIn(request);
  }

  // Make the new tokens visible to this same request's render, and store them in the browser.
  request.cookies.set(COOKIE.access, tokens.accessToken);
  request.cookies.set(COOKIE.accessExpiry, String(Date.parse(tokens.accessTokenExpiresAt)));
  request.cookies.set(COOKIE.refresh, tokens.refreshToken);
  const response = NextResponse.next({ request: { headers: request.headers } });
  writeSession(response.cookies, tokens);
  return response;
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
      source: '/(gym|trainer|partner|admin)/:path*',
      // Skip link prefetches: only real navigations may rotate the refresh token.
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
