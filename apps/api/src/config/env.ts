import { z } from 'zod';

/**
 * Every environment variable the API reads, validated at startup.
 * The process refuses to boot with a clear message if anything is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url().refine((v) => v.startsWith('postgres'), 'DATABASE_URL must be a PostgreSQL URL'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Number of reverse proxies in front of the API (for correct client IPs behind a load balancer). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /**
   * Shared with the web dashboard's server so it can pass on its visitors' IPs (for per-person
   * rate limits). At least 32 random characters; leave unset to ignore the header.
   */
  DASHBOARD_PROXY_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  /** Signs access tokens (HS256). At least 32 random characters; rotate by redeploying. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Server-side secret mixed into one-time-code and IP hashes, so a database leak can't be brute-forced. */
  OTP_PEPPER: z.string().min(32, 'must be at least 32 characters'),
  /** log = print codes to the server log (development only); memory = tests; resend = real email. */
  MAIL_DRIVER: z.enum(['log', 'memory', 'resend']).default('log'),
  MAIL_FROM: z.string().default('BGYM <no-reply@bgym.app>'),
  RESEND_API_KEY: z.string().optional(),
  /** paystack = real payments; dev = payment simulator for local development and tests (refused in production). */
  PAYMENTS_DRIVER: z.enum(['paystack', 'dev']).default('dev'),
  /** Paystack secret key (sk_test_… or sk_live_…). Also verifies webhook signatures. */
  PAYSTACK_SECRET_KEY: z.string().optional(),
  /** log = print pushes to the server log (development); memory = tests; expo = Expo push service. */
  PUSH_DRIVER: z.enum(['log', 'memory', 'expo']).default('log'),
  /** Optional Expo access token (enable "enhanced push security" in Expo to require it). */
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** Public address of the web dashboards; used for links in emails (unsubscribe). */
  WEB_URL: z.url().default('http://localhost:3000').transform((v) => v.replace(/\/$/, '')),
  /** local = files on this server's disk (development); s3 = S3-compatible storage such as Cloudflare R2. */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  /** "auto" for Cloudflare R2. */
  S3_REGION: z.string().default('auto'),
  /** e.g. https://<account>.r2.cloudflarestorage.com (leave unset for AWS S3). */
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL the bucket is served from, e.g. https://media.bgym.app (required with s3). */
  MEDIA_PUBLIC_URL: z.url().optional().transform((v) => v?.replace(/\/$/, '')),
  /** Email renewal reminders on a schedule. Turn off for tests or a second region sharing a database. */
  REMINDERS_ENABLED: z.stringbool().default(true),
  /** Where Paystack sends the browser after payment: the app's deep link. */
  PAYSTACK_CALLBACK_URL: z.string().default('bgym://payments/complete'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const env = parsed.data;
  const problems: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (env.CORS_ORIGINS.length === 0) problems.push('CORS_ORIGINS: required in production');
    if (env.MAIL_DRIVER !== 'resend') problems.push('MAIL_DRIVER: must be "resend" in production');
    if (env.STORAGE_DRIVER !== 's3') problems.push('STORAGE_DRIVER: must be "s3" in production');
    if (env.PUSH_DRIVER !== 'expo') problems.push('PUSH_DRIVER: must be "expo" in production');
    if (!env.WEB_URL.startsWith('https://')) problems.push('WEB_URL: must be https in production');
    if (env.PAYMENTS_DRIVER !== 'paystack') problems.push('PAYMENTS_DRIVER: must be "paystack" in production');
    if (env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_')) problems.push('PAYSTACK_SECRET_KEY: test key used in production');
    if (!env.DASHBOARD_PROXY_SECRET) problems.push('DASHBOARD_PROXY_SECRET: required in production');
    for (const key of ['JWT_ACCESS_SECRET', 'OTP_PEPPER', 'DASHBOARD_PROXY_SECRET'] as const) {
      if (env[key]?.startsWith('dev-')) problems.push(`${key}: development value used in production`);
    }
  }
  if (env.PAYMENTS_DRIVER === 'paystack' && !env.PAYSTACK_SECRET_KEY) problems.push('PAYSTACK_SECRET_KEY: required when PAYMENTS_DRIVER is "paystack"');
  if (env.STORAGE_DRIVER === 's3') {
    for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_URL'] as const) {
      if (!env[key]) problems.push(`${key}: required when STORAGE_DRIVER is "s3"`);
    }
  }
  if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) problems.push('RESEND_API_KEY: required when MAIL_DRIVER is "resend"');
  if (env.JWT_ACCESS_SECRET === env.OTP_PEPPER) problems.push('OTP_PEPPER: must differ from JWT_ACCESS_SECRET');
  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return env;
}
