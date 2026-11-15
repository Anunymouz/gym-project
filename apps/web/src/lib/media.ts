/**
 * Photo URLs from the API are either relative to the API ("/v1/media/…", development) or
 * absolute CDN URLs (production). The dashboard reaches development ones via its /media rewrite.
 */
export function mediaSrc(url: string): string {
  return url.startsWith('/v1/media/') ? url.replace('/v1/media/', '/media/') : url;
}
