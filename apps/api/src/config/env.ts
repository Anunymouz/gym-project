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
  /** Signs access tokens (HS256). At least 32 random characters; rotate by redeploying. */
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** Server-side secret mixed into one-time-code and IP hashes, so a database leak can't be brute-forced. */
  OTP_PEPPER: z.string().min(32, 'must be at least 32 characters'),
  /** log = print codes to the server log (development only); memory = tests; resend = real email. */
  MAIL_DRIVER: z.enum(['log', 'memory', 'resend']).default('log'),
  MAIL_FROM: z.string().default('BGYM <no-reply@bgym.app>'),
  RESEND_API_KEY: z.string().optional(),
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
    for (const key of ['JWT_ACCESS_SECRET', 'OTP_PEPPER'] as const) {
      if (env[key].startsWith('dev-')) problems.push(`${key}: development value used in production`);
    }
  }
  if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) problems.push('RESEND_API_KEY: required when MAIL_DRIVER is "resend"');
  if (env.JWT_ACCESS_SECRET === env.OTP_PEPPER) problems.push('OTP_PEPPER: must differ from JWT_ACCESS_SECRET');
  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return env;
}
