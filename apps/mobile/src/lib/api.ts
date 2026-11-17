import {
  nearbyGymsQuerySchema,
  resolveMediaUrl,
  type AuthSession,
  type CompleteSessionInput,
  type ExerciseMedia,
  type WorkoutDetail,
  type WorkoutHistoryItem,
  type WorkoutsHome,
  type WorkoutStats,
  type AuthTokens,
  type AuthUser,
  type AddressInput,
  type BlockedUser,
  type Cart,
  type CheckoutQuote,
  type OrderSummary,
  type ProductDetail,
  type SavedAddress,
  type StoreCategory,
  type StoreCheckout,
  type StorePage,
  type BookingCheckout,
  type BookSessionInput,
  type DaySlots,
  type MyBooking,
  type MyPackage,
  type TrainerCard,
  type TrainerDetail,
  type CommentPage,
  type FeedPage,
  type FeedPost,
  type PostComment,
  type ReportInput,
  type StoryTray,
  type VideoUploadStatus,
  type VideoUploadTicket,
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
import { Platform } from 'react-native';
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

/** Drops headers set to undefined (multipart requests let fetch set Content-Type). */
function cleanHeaders(h: Record<string, string | undefined> | HeadersInit): Record<string, string> {
  return Object.fromEntries(Object.entries(h as Record<string, string | undefined>).filter((e): e is [string, string] => e[1] !== undefined));
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: cleanHeaders({ Accept: 'application/json', ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init.headers }),
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
async function authed<T>(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  if (!access || access.expiresAt - Date.now() < 60_000) await refreshSession();
  const send = () => request<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${access?.token ?? ''}` } }, timeoutMs);
  try {
    return await send();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && (await refreshSession())) return send();
    throw err;
  }
}

/** A fresh access token for requests made outside fetch (uploads with progress). */
async function accessToken(): Promise<string> {
  if (!access || access.expiresAt - Date.now() < 60_000) await refreshSession();
  return access?.token ?? '';
}

/** A picked file (photo or video) to send as multipart form data. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

/** Adds a file to a form: native takes {uri,name,type}; the web needs the actual Blob. */
export async function appendFile(form: FormData, field: string, file: PickedFile): Promise<void> {
  if (Platform.OS === 'web') {
    form.append(field, await (await fetch(file.uri)).blob(), file.name);
    return;
  }
  form.append(field, file as unknown as Blob);
}

/** Multipart request with the access token (fetch sets the boundary itself). */
const authedForm = <T>(path: string, form: FormData, method = 'POST') => authed<T>(path, { method, body: form, headers: { 'Content-Type': undefined as unknown as string } }, 120_000);

/**
 * Upload with progress (fetch can't report it). Used for videos, which can be large.
 * Resolves with the parsed JSON body (if any).
 */
function uploadWithProgress<T>(url: string, form: FormData, headers: Record<string, string>, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { message?: unknown } | null = null;
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as { message?: unknown }) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T);
      if (xhr.status === 413) return reject(new ApiError('That video is too big. Try a shorter clip.', 413));
      reject(new ApiError(typeof body?.message === 'string' && xhr.status < 500 ? body.message : 'The upload didn’t go through. Try again.', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError(OFFLINE));
    xhr.ontimeout = () => reject(new ApiError(OFFLINE));
    xhr.timeout = 15 * 60_000;
    xhr.send(form);
  });
}

// ───────────── Endpoints ─────────────

export { authed };

export const authApi = {
  requestEmailCode: (email: string) => post<RequestEmailCodeResponse>('/v1/auth/email/request', { email }),
  verifyEmailCode: async (email: string, code: string) => {
    const session = await post<AuthSession>('/v1/auth/email/verify', { email, code });
    return { ...session, user: userMedia(session.user) };
  },
  me: async () => userMedia(await authed<AuthUser>('/v1/auth/me')),
  updateProfile: async (input: UpdateProfileInput) => userMedia(await authed<AuthUser>('/v1/auth/me', { method: 'PATCH', body: JSON.stringify(input) })),
  /** A new profile photo (the API crops it square and strips its metadata). */
  setAvatar: async (photo: PickedFile) => {
    const form = new FormData();
    await appendFile(form, 'photo', photo);
    return userMedia(await authedForm<AuthUser>('/v1/auth/me/avatar', form));
  },
  removeAvatar: async () => userMedia(await authed<AuthUser>('/v1/auth/me/avatar', { method: 'DELETE' })),
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

const userMedia = (u: AuthUser): AuthUser => ({ ...u, avatarUrl: media(u.avatarUrl) });
const authorMedia = <A extends object>(a: A): A => ('avatarUrl' in a && typeof a.avatarUrl === 'string' ? { ...a, avatarUrl: media(a.avatarUrl) } : a);

/** Make post photo URLs absolute (they may be relative to the API in development). */
const withMedia = (p: FeedPost): FeedPost => ({
  ...p,
  author: authorMedia(p.author),
  gym: { ...p.gym, coverUrl: media(p.gym.coverUrl) },
  media: p.media.map((m) => ({ ...m, url: media(m.url) ?? m.url, thumbUrl: media(m.thumbUrl) ?? m.thumbUrl })),
});

export const feedApi = {
  page: async (cursor?: string | null): Promise<FeedPage> => {
    const page = await authed<FeedPage>(`/v1/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    return { ...page, posts: page.posts.map(withMedia) };
  },
  gymPosts: async (slug: string) => (await request<FeedPost[]>(`/v1/gyms/${encodeURIComponent(slug)}/posts`)).map(withMedia),
  like: (postId: string, on: boolean) => authed<{ likeCount: number; likedByMe: boolean }>(`/v1/posts/${postId}/like`, { method: on ? 'PUT' : 'DELETE' }),
  report: (postId: string, input: ReportInput) => authed<void>(`/v1/posts/${postId}/report`, { method: 'POST', body: JSON.stringify(input) }),
};

export const postsApi = {
  get: async (id: string) => withMedia(await authed<FeedPost>(`/v1/posts/${id}`)),
  /** Text plus photos, or a ready video (by its upload id). */
  create: async (input: { gymId: string; body: string; photos: PickedFile[]; videoId?: string }) => {
    const form = new FormData();
    form.append('gymId', input.gymId);
    form.append('body', input.body);
    if (input.videoId) form.append('videoId', input.videoId);
    for (const p of input.photos) await appendFile(form, 'photos', p);
    return withMedia(await authedForm<FeedPost>('/v1/posts', form));
  },
  remove: (id: string) => authed<void>(`/v1/posts/${id}`, { method: 'DELETE' }),
  comments: async (id: string, cursor?: string | null) => {
    const page = await authed<CommentPage>(`/v1/posts/${id}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    return { ...page, comments: page.comments.map((c) => ({ ...c, author: authorMedia(c.author) })) };
  },
  comment: async (id: string, body: string) => {
    const c = await authed<PostComment>(`/v1/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    return { ...c, author: authorMedia(c.author) };
  },
  removeComment: (commentId: string) => authed<{ commentCount: number }>(`/v1/comments/${commentId}`, { method: 'DELETE' }),
  reportComment: (commentId: string, input: ReportInput) => authed<void>(`/v1/comments/${commentId}/report`, { method: 'POST', body: JSON.stringify(input) }),
};

const storyMedia = (t: StoryTray): StoryTray => ({
  ...t,
  groups: t.groups.map((g) => ({ ...g, author: authorMedia(g.author), gym: { ...g.gym, coverUrl: media(g.gym.coverUrl) }, stories: g.stories.map((s) => ({ ...s, url: media(s.url) ?? s.url, thumbUrl: media(s.thumbUrl) ?? s.thumbUrl })) })),
});

export const storiesApi = {
  tray: async () => storyMedia(await authed<StoryTray>('/v1/stories')),
  create: async (input: { gymId: string; caption: string; photo?: PickedFile; videoId?: string }) => {
    const form = new FormData();
    form.append('gymId', input.gymId);
    if (input.caption) form.append('caption', input.caption);
    if (input.videoId) form.append('videoId', input.videoId);
    if (input.photo) await appendFile(form, 'photos', input.photo);
    return storyMedia(await authedForm<StoryTray>('/v1/stories', form));
  },
  view: (id: string) => authed<void>(`/v1/stories/${id}/view`, { method: 'POST' }),
  like: (id: string, on: boolean) => authed<{ likedByMe: boolean }>(`/v1/stories/${id}/like`, { method: on ? 'PUT' : 'DELETE' }),
  remove: (id: string) => authed<void>(`/v1/stories/${id}`, { method: 'DELETE' }),
  report: (id: string, input: ReportInput) => authed<void>(`/v1/stories/${id}/report`, { method: 'POST', body: JSON.stringify(input) }),
};

export const communityApi = {
  acceptRules: () => authed<void>('/v1/me/community-rules', { method: 'POST' }),
  blocks: async () => (await authed<BlockedUser[]>('/v1/me/blocks')).map(authorMedia),
  block: (userId: string) => authed<void>(`/v1/me/blocks/${userId}`, { method: 'PUT' }),
  unblock: (userId: string) => authed<void>(`/v1/me/blocks/${userId}`, { method: 'DELETE' }),
};

export const videoApi = {
  /**
   * Uploads a video and waits until it's ready to post. Sends it to our API (development) or
   * straight to Cloudflare Stream (production), reporting progress, then polls for "ready".
   */
  async upload(purpose: 'post' | 'story', file: PickedFile, onProgress?: (stage: 'uploading' | 'processing', fraction: number) => void): Promise<VideoUploadStatus> {
    const ticket = await authed<VideoUploadTicket>('/v1/videos', { method: 'POST', body: JSON.stringify({ purpose }) });
    const form = new FormData();
    await appendFile(form, 'file', file);
    const url = ticket.authenticated ? `${API_URL}${ticket.uploadUrl}` : ticket.uploadUrl;
    const headers: Record<string, string> = ticket.authenticated ? { Authorization: `Bearer ${await accessToken()}` } : {};
    const uploaded = await uploadWithProgress<VideoUploadStatus | null>(url, form, headers, (f) => onProgress?.('uploading', f));
    let status = ticket.authenticated && uploaded ? uploaded : await authed<VideoUploadStatus>(`/v1/videos/${ticket.id}`);
    for (let i = 0; status.status !== 'ready' && status.status !== 'failed' && i < 120; i++) {
      onProgress?.('processing', 0);
      await new Promise((r) => setTimeout(r, 2500));
      status = await authed<VideoUploadStatus>(`/v1/videos/${ticket.id}`);
    }
    if (status.status !== 'ready') throw new ApiError(status.error ?? 'That video took too long to process. Try again.');
    return status;
  },
};

const trainerMedia = <T extends { photoUrl: string | null }>(t: T): T => ({ ...t, photoUrl: media(t.photoUrl) });

export const trainersApi = {
  list: async (gymSlug?: string) => (await authed<TrainerCard[]>(`/v1/trainers${gymSlug ? `?gym=${encodeURIComponent(gymSlug)}` : ''}`)).map(trainerMedia),
  detail: async (id: string) => trainerMedia(await authed<TrainerDetail>(`/v1/trainers/${id}`)),
  slots: (id: string, from: string, days = 7) => authed<DaySlots[]>(`/v1/trainers/${id}/slots?from=${from}&days=${days}`),
  book: (id: string, input: BookSessionInput) => authed<BookingCheckout>(`/v1/trainers/${id}/bookings`, { method: 'POST', body: JSON.stringify(input) }),
  buyPackage: (packageId: string) => authed<BookingCheckout>(`/v1/trainer-packages/${packageId}/purchase`, { method: 'POST' }),
  myBookings: async () => (await authed<MyBooking[]>('/v1/me/bookings')).map((b) => ({ ...b, trainer: trainerMedia(b.trainer) })),
  cancel: async (bookingId: string) => {
    const b = await authed<MyBooking>(`/v1/me/bookings/${bookingId}/cancel`, { method: 'POST' });
    return { ...b, trainer: trainerMedia(b.trainer) };
  },
  myPackages: () => authed<MyPackage[]>('/v1/me/packages'),
};

const productMedia = <T extends { imageUrl: string | null; thumbUrl: string | null }>(p: T): T => ({ ...p, imageUrl: media(p.imageUrl), thumbUrl: media(p.thumbUrl) });

export const storeApi = {
  categories: () => authed<StoreCategory[]>('/v1/store/categories'),
  products: async (q: { category?: string; q?: string; cursor?: string | null }) => {
    const params = new URLSearchParams();
    if (q.category) params.set('category', q.category);
    if (q.q) params.set('q', q.q);
    if (q.cursor) params.set('cursor', q.cursor);
    const page = await authed<StorePage>(`/v1/store/products${params.size ? `?${params}` : ''}`);
    return { ...page, products: page.products.map(productMedia) };
  },
  product: async (id: string) => {
    const p = await authed<ProductDetail>(`/v1/store/products/${id}`);
    return { ...productMedia(p), images: p.images.map((i) => ({ ...i, url: media(i.url) ?? i.url, thumbUrl: media(i.thumbUrl) ?? i.thumbUrl })) };
  },
  cart: async () => cartMedia(await authed<Cart>('/v1/me/cart')),
  setLine: async (variantId: string, quantity: number) => cartMedia(await authed<Cart>('/v1/me/cart', { method: 'PUT', body: JSON.stringify({ variantId, quantity }) })),
  addresses: () => authed<SavedAddress[]>('/v1/me/addresses'),
  addAddress: (input: AddressInput) => authed<SavedAddress[]>('/v1/me/addresses', { method: 'POST', body: JSON.stringify(input) }),
  updateAddress: (id: string, input: AddressInput) => authed<SavedAddress[]>(`/v1/me/addresses/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeAddress: (id: string) => authed<SavedAddress[]>(`/v1/me/addresses/${id}`, { method: 'DELETE' }),
  defaultAddress: (id: string) => authed<SavedAddress[]>(`/v1/me/addresses/${id}/default`, { method: 'POST' }),
  quote: (addressId: string) => authed<CheckoutQuote>('/v1/me/checkout/quote', { method: 'POST', body: JSON.stringify({ addressId }) }),
  checkout: (addressId: string, note?: string) => authed<StoreCheckout>('/v1/me/checkout', { method: 'POST', body: JSON.stringify({ addressId, ...(note && { note }) }) }),
  orders: async () => (await authed<OrderSummary[]>('/v1/me/orders')).map(orderMedia),
  order: async (id: string) => orderMedia(await authed<OrderSummary>(`/v1/me/orders/${id}`)),
  cancelOrder: async (id: string) => orderMedia(await authed<OrderSummary>(`/v1/me/orders/${id}/cancel`, { method: 'POST' })),
};
const cartMedia = (c: Cart): Cart => ({ ...c, lines: c.lines.map((l) => ({ ...l, thumbUrl: media(l.thumbUrl) })) });
const orderMedia = (o: OrderSummary): OrderSummary => ({ ...o, items: o.items.map((i) => ({ ...i, thumbUrl: media(i.thumbUrl) })) });

// ── Workouts ──
const exerciseMediaUrls = (m: ExerciseMedia | null | undefined): ExerciseMedia | null | undefined =>
  m && { ...m, url: media(m.url) ?? m.url, thumbUrl: media(m.thumbUrl) };
export const workoutsApi = {
  home: async (): Promise<WorkoutsHome> => {
    const h = await authed<WorkoutsHome>('/v1/workouts');
    return { ...h, workouts: h.workouts.map((w) => ({ ...w, coverUrl: media(w.coverUrl) })) };
  },
  detail: async (id: string): Promise<WorkoutDetail> => {
    const w = await authed<WorkoutDetail>(`/v1/workouts/${id}`);
    return { ...w, coverUrl: media(w.coverUrl), steps: w.steps.map((s) => ({ ...s, exercise: { ...s.exercise, ...(s.exercise.media !== undefined && { media: exerciseMediaUrls(s.exercise.media) }) } })) };
  },
  complete: (id: string, input: CompleteSessionInput) => authed<WorkoutStats>(`/v1/workouts/${id}/sessions`, { method: 'POST', body: JSON.stringify(input) }),
  history: async () => (await authed<WorkoutHistoryItem[]>('/v1/me/workouts/history')).map((h) => ({ ...h, workout: { ...h.workout, coverUrl: media(h.workout.coverUrl) } })),
};
