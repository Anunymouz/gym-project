import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 6-digit numeric code from a CSPRNG (uniform, leading zeros kept). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 32 random bytes, base64url (43 chars): used for refresh tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Keyed hash for low-entropy secrets (one-time codes, IPs): useless without the server pepper. */
export function hmac(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** Plain hash for high-entropy secrets (refresh tokens): fast lookups, nothing to brute-force. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
