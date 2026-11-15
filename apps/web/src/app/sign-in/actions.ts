'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { emailSchema, otpCodeSchema, type AuthSession, type RequestEmailCodeResponse } from '@bgym/shared';
import { ApiError, publicApi } from '@/lib/api.server';
import { writeSession } from '@/lib/auth/cookies';

export type SignInState =
  | { step: 'email'; error?: string; email?: string }
  | { step: 'code'; email: string; error?: string; resent?: boolean };

/** Only allow redirects back into this site's dashboards (prevents open redirects). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : '';
  return /^\/(gym|trainer|partner|admin)(\/[a-z0-9-]*)*$/.test(next) ? next : '/gym';
}

export async function requestCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(form.get('email'));
  if (!parsed.success) return { step: 'email', error: parsed.error.issues[0]?.message ?? 'Enter a valid email address', email: String(form.get('email') ?? '') };
  try {
    await publicApi<RequestEmailCodeResponse>('/v1/auth/email/request', { method: 'POST', body: JSON.stringify({ email: parsed.data }) });
    return { step: 'code', email: parsed.data, resent: form.get('resend') === '1' };
  } catch (err) {
    return { step: 'email', email: parsed.data, error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}

export async function verifyCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { step: 'email', error: 'Start again with your email.' };
  const code = otpCodeSchema.safeParse(String(form.get('code') ?? '').replace(/\D/g, ''));
  if (!code.success) return { step: 'code', email: email.data, error: 'Enter the 6-digit code.' };

  let session: AuthSession;
  try {
    session = await publicApi<AuthSession>('/v1/auth/email/verify', { method: 'POST', body: JSON.stringify({ email: email.data, code: code.data }) });
  } catch (err) {
    return { step: 'code', email: email.data, error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
  writeSession(await cookies(), session);
  redirect(safeNext(form.get('next')));
}
