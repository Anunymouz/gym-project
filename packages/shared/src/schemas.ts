import { z } from 'zod';

/** User roles across BGYM. A user can hold more than one (e.g. member + trainer). */
export const roleSchema = z.enum(['member', 'gym_staff', 'trainer', 'partner', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }))
  .refine((v) => v.length <= 254, 'Email address is too long');

/** Six-digit one-time code sent by email. */
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const requestEmailCodeSchema = z.object({ email: emailSchema });
export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>;

export const verifyEmailCodeSchema = z.object({ email: emailSchema, code: otpCodeSchema });
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

/** Ghana mobile number, stored in E.164 (+233XXXXXXXXX). Used for MoMo and delivery, not login. */
export const ghanaPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (v.startsWith('0') ? `+233${v.slice(1)}` : v))
  .pipe(z.string().regex(/^\+233[235]\d{8}$/, 'Enter a valid Ghana phone number'));

/** Search radius options shown in the app (km). */
export const SEARCH_RADII_KM = [1, 3, 5, 10, 20] as const;

export const nearbyGymsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().refine((v) => (SEARCH_RADII_KM as readonly number[]).includes(v), {
    message: 'Unsupported radius',
  }),
});
export type NearbyGymsQuery = z.infer<typeof nearbyGymsQuerySchema>;

export interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  uptimeSeconds: number;
  checks: Record<string, 'up' | 'down'>;
}
