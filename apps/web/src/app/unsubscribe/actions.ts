'use server';

import { unsubscribeSchema, type UnsubscribeResponse } from '@bgym/shared';
import { ApiError, publicApi } from '@/lib/api.server';

export type UnsubscribeState = { done?: UnsubscribeResponse; error?: string };

export async function unsubscribe(_prev: UnsubscribeState, form: FormData): Promise<UnsubscribeState> {
  const parsed = unsubscribeSchema.safeParse({ token: form.get('t') });
  if (!parsed.success) return { error: 'This link is incomplete. Open it again from the email, or change your settings in the BGYM app.' };
  try {
    return { done: await publicApi<UnsubscribeResponse>('/v1/notifications/unsubscribe', { method: 'POST', body: JSON.stringify(parsed.data) }) };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' };
  }
}
