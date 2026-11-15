import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL, visitorHeaders } from './api-config';
import { COOKIE } from './auth/cookies';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Pass the visitor's IP on so the API's per-client rate limits see the person, not this server. */
async function forwardedFor(): Promise<Record<string, string>> {
  const h = await headers();
  return visitorHeaders(h.get('x-forwarded-for') ?? h.get('x-real-ip'));
}

const UNREACHABLE = 'We can’t reach BGYM right now. Check your connection and try again in a moment.';

/** fetch that turns "server not reachable" (API down or restarting) into a clear ApiError. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(UNREACHABLE, 503);
  }
}

/** Calls the API without a session (sign-in endpoints). */
export async function publicApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(await forwardedFor()), ...init.headers },
  });
  return parse<T>(res);
}

/** Calls the API as the signed-in person. The proxy keeps the access token fresh. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(COOKIE.access)?.value;
  if (!token) redirect('/sign-in');
  const res = await send(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(await forwardedFor()), ...init.headers },
  });
  if (res.status === 401) redirect('/sign-in');
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  if (!res.ok) {
    const message =
      res.status === 429
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : res.status >= 500
          ? 'Something went wrong on our side. Please try again.'
          : typeof body?.message === 'string'
            ? body.message
            : Array.isArray(body?.message)
              ? String(body.message[0])
              : 'Something went wrong.';
    throw new ApiError(message, res.status);
  }
  return body as T;
}
