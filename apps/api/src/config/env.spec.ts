import { validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('validateEnv', () => {
  it('applies safe defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('parses a comma-separated CORS allowlist', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://localhost:3000, https://app.bgym.app' });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://app.bgym.app']);
  });

  it('rejects a missing database URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('requires an explicit CORS allowlist in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });
});
