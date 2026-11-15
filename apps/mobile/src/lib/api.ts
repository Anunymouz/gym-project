import {
  nearbyGymsQuerySchema,
  resolveMediaUrl,
  type AuthSession,
  type AuthTokens,
  type AuthUser,
  type CheckoutResponse,
  type GymDetail,
  type MembershipPass,
  type MembershipSummary,
  type PaymentStatusResponse,
  type Receipt,
  type ReceiptSummary,
  type NearbyGymsQuery,
  type NotificationSettings,
  type RegisterDeviceInput,
  type UpdateNotificationSetting,
  type RequestEmailCodeResponse,
  type UpdateProfileInput,
} from '@bgym/shared';
import { secureStorage } from './secure-storage';

/**
 * API base URL. On a physical phone, set EXPO_PUBLIC_API_URL to your computer's LAN address
 * (e.g. http://192.168.1.20:4000); "localhost" only works in simulators and on web.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const REFRESH_KEY = 'bgym.refresh.v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork(): boolean {
    return this.status === undefined;
  }
}

const OFFLINE = "Can't reach BGYM right now. Check your connection and try again.";

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(OFFLINE);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  if (!res.ok) {
    if (res.status === 429) throw new ApiError('Too many attempts. Please wait a few minutes and try again.', 429);
    const message = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? String(body.message[0]) : `Something went wrong (${res.status})`;
    throw new ApiError(res.status >= 500 ? 'Something went wrong on our side. Please try again.' : message, res.status);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown, headers?: Record<string, string>) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), ...(headers && { headers }) });

// ───────────── Tokens ─────────────
// The access token lives in memory only; the refresh token in secure storage.

let access: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionEnded: (() => void) | null = null;

/** The session provider registers this to sign the person out when their session can't be renewed. */
export function setSessionEndedHandler(handler: () => void): void {
  onSessionEnded = handler;
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  access = { token: tokens.accessToken, expiresAt: Date.parse(tokens.accessTokenExpiresAt) };
  await secureStorage.set(REFRESH_KEY, tokens.refreshToken);
}

export async function clearTokens(): Promise<string | null> {
  const refreshToken = await secureStorage.get(REFRESH_KEY);
  access = null;
  await secureStorage.remove(REFRESH_KEY);
  return refreshToken;
}

export async function hasStoredSession(): Promise<boolean> {
  return (await secureStorage.get(REFRESH_KEY)) !== null;
}

/**
 * Exchanges the stored refresh token for new tokens. Concurrent callers share one request
 * (refresh tokens are single-use). Network errors are rethrown; a rejected token ends the session.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await secureStorage.get(REFRESH_KEY);
      if (!refreshToken) return false;
      await saveTokens(await post<AuthTokens>('/v1/auth/refresh', { refreshToken }));
      return true;
    } catch (err) {
      if (err instanceof ApiError && !err.isNetwork) {
        await clearTokens();
        onSessionEnded?.();
        return false;
      }
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Request with the access token, renewing it first if it's about to expire, and once more on a 401. */
async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!access || access.expiresAt - Date.now() < 60_000) await refreshSession();
  const send = () => request<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${access?.token ?? ''}` } });
  try {
    return await send();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && (await refreshSession())) return send();
    throw err;
  }
}

// ───────────── Endpoints ─────────────

export { authed };

export const authApi = {
  requestEmailCode: (email: string) => post<RequestEmailCodeResponse>('/v1/auth/email/request', { email }),
  verifyEmailCode: (email: string, code: string) => post<AuthSession>('/v1/auth/email/verify', { email, code }),
  me: () => authed<AuthUser>('/v1/auth/me'),
  updateProfile: (input: UpdateProfileInput) => authed<AuthUser>('/v1/auth/me', { method: 'PATCH', body: JSON.stringify(input) }),
  async signOut(): Promise<void> {
    const refreshToken = await clearTokens();
    if (refreshToken) await post<void>('/v1/auth/sign-out', { refreshToken }).catch(() => undefined);
  },
};

export interface NearbyGym {
  id: string;
  name: string;
  slug: string;
  addressText: string;
  coverUrl: string | null;
  facilities: string[];
  distanceKm: number;
  fromPricePesewas: number | null;
}

export async function fetchNearbyGyms(query: NearbyGymsQuery): Promise<NearbyGym[]> {
  const q = nearbyGymsQuerySchema.parse(query);
  const params = new URLSearchParams({ lat: String(q.lat), lng: String(q.lng), radiusKm: String(q.radiusKm) });
  const gyms = await request<NearbyGym[]>(`/v1/gyms/nearby?${params.toString()}`);
  return gyms.map((g) => ({ ...g, coverUrl: media(g.coverUrl) }));
}

export async function fetchGym(slug: string): Promise<GymDetail> {
  const gym = await request<GymDetail>(`/v1/gyms/${encodeURIComponent(slug)}`);
  return { ...gym, coverUrl: media(gym.coverUrl), photos: gym.photos.flatMap((p) => media(p) ?? []) };
}

/** Photo URLs can be relative to the API in development ("/v1/media/…"): make them absolute. */
const media = (url: string | null) => resolveMediaUrl(url, API_URL);

export const membershipsApi = {
  checkout: (planId: string) => authed<CheckoutResponse>('/v1/memberships/checkout', { method: 'POST', body: JSON.stringify({ planId }) }),
  paymentStatus: (reference: string) => authed<PaymentStatusResponse>(`/v1/payments/${reference}`),
  /** Development builds only: the API refuses this unless PAYMENTS_DRIVER=dev. */
  simulatePayment: (reference: string) => authed<PaymentStatusResponse>(`/v1/payments/${reference}/simulate`, { method: 'POST' }),
  list: async () => (await authed<MembershipSummary[]>('/v1/memberships')).map((m) => ({ ...m, gym: { ...m.gym, coverUrl: media(m.gym.coverUrl) } })),
  pass: (membershipId: string) => authed<MembershipPass>(`/v1/memberships/${membershipId}/pass`),
};

export const notificationsApi = {
  settings: () => authed<NotificationSettings>('/v1/me/notifications'),
  update: (change: UpdateNotificationSetting) => authed<NotificationSettings>('/v1/me/notifications', { method: 'PATCH', body: JSON.stringify(change) }),
  registerDevice: (input: RegisterDeviceInput) => authed<void>('/v1/me/devices', { method: 'PUT', body: JSON.stringify(input) }),
  unregisterDevice: (token: string) => authed<void>('/v1/me/devices/unregister', { method: 'POST', body: JSON.stringify({ token }) }),
};

export const receiptsApi = {
  list: () => authed<ReceiptSummary[]>('/v1/me/payments'),
  get: (id: string) => authed<Receipt>(`/v1/me/payments/${encodeURIComponent(id)}`),
};
