import { unsubscribeSchema } from '@bgym/shared';
import { publicApi } from '@/lib/api.server';

/**
 * RFC 8058 one-click unsubscribe: mail apps (Gmail, Apple Mail) POST here when the person
 * presses their built-in "Unsubscribe" button. Only POST: a GET must never change anything.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = unsubscribeSchema.safeParse({ token: new URL(request.url).searchParams.get('t') });
  if (!parsed.success) return new Response('Invalid link', { status: 400 });
  try {
    await publicApi('/v1/notifications/unsubscribe', { method: 'POST', body: JSON.stringify(parsed.data) });
    return new Response('Unsubscribed', { status: 200 });
  } catch {
    return new Response('Could not unsubscribe', { status: 400 });
  }
}
