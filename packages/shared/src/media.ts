/** Gym photos: limits shared by the dashboard (checks before upload) and the API (enforces). */
export const MAX_GYM_PHOTOS = 12;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** The longer side must be at least this many pixels, so photos look sharp in the app. */
export const MIN_PHOTO_LONG_SIDE = 800;
export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface GymPhotoItem {
  id: string;
  /** Large image (up to 1600 px). Relative ("/v1/media/…") in development, a CDN URL in production. */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  /** The first photo is the gym's cover in the app. */
  isCover: boolean;
}

/** Media URLs from the API may be relative to the API ("/v1/media/…"); make them absolute. */
export function resolveMediaUrl(url: string | null | undefined, apiBase: string): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${apiBase.replace(/\/$/, '')}${url}` : url;
}
