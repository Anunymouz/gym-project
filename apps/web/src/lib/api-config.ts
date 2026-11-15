import 'server-only';

/** API base URL for server-side calls (the browser never calls the API directly). */
export const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const PROXY_SECRET = process.env.API_PROXY_SECRET;

/**
 * Headers that pass the visitor's IP on to the API, so its rate limits apply per person
 * rather than to this server as a whole. The API only trusts them with the shared secret.
 */
export function visitorHeaders(forwardedFor: string | null | undefined): Record<string, string> {
  const ip = forwardedFor?.split(',')[0]?.trim();
  return PROXY_SECRET && ip ? { 'X-BGYM-Proxy-Secret': PROXY_SECRET, 'X-BGYM-Client-IP': ip } : {};
}
