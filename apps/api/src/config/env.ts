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
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.CORS_ORIGINS.length === 0) {
    throw new Error('Invalid environment configuration:\n  - CORS_ORIGINS: required in production');
  }
  return parsed.data;
}
