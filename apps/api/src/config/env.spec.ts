import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'dev-jwt-secret-0123456789abcdefghijklmnop',
  OTP_PEPPER: 'dev-otp-pepper-0123456789abcdefghijklmnop',
};
const prod = {
  ...base,
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://app.bgym.app',
  MAIL_DRIVER: 'resend',
  RESEND_API_KEY: 're_test',
  PAYMENTS_DRIVER: 'paystack',
  PAYSTACK_SECRET_KEY: 'sk_live_example',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  OTP_PEPPER: 'y'.repeat(40),
  DASHBOARD_PROXY_SECRET: 'z'.repeat(40),
  PUSH_DRIVER: 'expo',
  WEB_URL: 'https://business.bgym.app',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'bgym-media',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  MEDIA_PUBLIC_URL: 'https://media.bgym.app',
};

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

  it('accepts a complete production configuration', () => {
    expect(validateEnv(prod).MAIL_DRIVER).toBe('resend');
  });

  it('requires an explicit CORS allowlist in production', () => {
    expect(() => validateEnv({ ...prod, CORS_ORIGINS: '' })).toThrow(/CORS_ORIGINS/);
  });

  it('refuses development secrets and the log mailer in production', () => {
    expect(() => validateEnv({ ...prod, JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...prod, MAIL_DRIVER: 'log' })).toThrow(/MAIL_DRIVER/);
  });

  it('refuses the payment simulator and Paystack test keys in production', () => {
    expect(() => validateEnv({ ...prod, PAYMENTS_DRIVER: 'dev' })).toThrow(/PAYMENTS_DRIVER/);
    expect(() => validateEnv({ ...prod, PAYSTACK_SECRET_KEY: 'sk_test_x' })).toThrow(/test key/);
  });

  it('requires a real dashboard proxy secret in production', () => {
    expect(() => validateEnv({ ...prod, DASHBOARD_PROXY_SECRET: undefined })).toThrow(/DASHBOARD_PROXY_SECRET/);
    expect(() => validateEnv({ ...prod, DASHBOARD_PROXY_SECRET: `dev-${'z'.repeat(40)}` })).toThrow(/DASHBOARD_PROXY_SECRET/);
  });

  it('requires real push delivery and an https web address in production', () => {
    expect(() => validateEnv({ ...prod, PUSH_DRIVER: 'log' })).toThrow(/PUSH_DRIVER/);
    expect(() => validateEnv({ ...prod, WEB_URL: 'http://business.bgym.app' })).toThrow(/WEB_URL/);
  });

  it('requires object storage in production, fully configured', () => {
    expect(() => validateEnv({ ...prod, STORAGE_DRIVER: 'local' })).toThrow(/STORAGE_DRIVER/);
    expect(() => validateEnv({ ...prod, MEDIA_PUBLIC_URL: undefined })).toThrow(/MEDIA_PUBLIC_URL/);
  });

  it('needs every Cloudflare Stream setting when videos go to Stream', () => {
    expect(() => validateEnv({ ...base, VIDEO_DRIVER: 'stream', CF_ACCOUNT_ID: 'acc' })).toThrow(/CF_STREAM_API_TOKEN/);
    const stream = { CF_ACCOUNT_ID: 'acc', CF_STREAM_API_TOKEN: 't', CF_STREAM_CUSTOMER_CODE: 'abc123', CF_STREAM_SIGNING_KEY_ID: 'k', CF_STREAM_SIGNING_KEY_PEM: 'cGVt' };
    expect(validateEnv({ ...base, VIDEO_DRIVER: 'stream', ...stream }).VIDEO_DRIVER).toBe('stream');
    expect(() => validateEnv({ ...base, VIDEO_DRIVER: 'stream', ...stream, CF_STREAM_CUSTOMER_CODE: 'evil.example.com/x' })).toThrow(/CF_STREAM_CUSTOMER_CODE/);
  });

  it('rejects short secrets', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
