import { z } from 'zod';
import type { Role } from './schemas.js';

/** A rotating refresh token: 43 base64url characters (32 random bytes). */
export const refreshTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid session');
export const refreshRequestSchema = z.object({ refreshToken: refreshTokenSchema });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  roles: Role[];
  goal: string | null;
}

export interface AuthTokens {
  accessToken: string;
  /** ISO 8601 */
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export interface AuthSession extends AuthTokens {
  user: AuthUser;
  isNewUser: boolean;
}

/** Always the same response, whether or not the email has an account (no account enumeration). */
export interface RequestEmailCodeResponse {
  sent: true;
  /** Seconds before another code can be requested. */
  retryAfterSeconds: number;
}

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
