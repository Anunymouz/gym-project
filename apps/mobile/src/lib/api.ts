import { nearbyGymsQuerySchema, type NearbyGymsQuery } from '@bgym/shared';

/**
 * API base URL. On a physical phone, set EXPO_PUBLIC_API_URL to your computer's LAN address
 * (e.g. http://192.168.1.20:4000); "localhost" only works in simulators and on web.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers },
    });
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Can't reach BGYM right now. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

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

export function fetchNearbyGyms(query: NearbyGymsQuery): Promise<NearbyGym[]> {
  const q = nearbyGymsQuerySchema.parse(query);
  const params = new URLSearchParams({ lat: String(q.lat), lng: String(q.lng), radiusKm: String(q.radiusKm) });
  return request<NearbyGym[]>(`/v1/gyms/nearby?${params.toString()}`);
}
