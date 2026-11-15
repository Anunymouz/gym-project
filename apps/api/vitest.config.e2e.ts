import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // End-to-end files share one database: run them one at a time.
    fileParallelism: false,
    env: {
      LOG_LEVEL: 'silent',
      MAIL_DRIVER: 'memory',
      JWT_ACCESS_SECRET: 'test-jwt-secret-0123456789abcdefghijklmnopqrstuv',
      OTP_PEPPER: 'test-otp-pepper-0123456789abcdefghijklmnopqrstuv',
      PAYMENTS_DRIVER: 'dev',
      REMINDERS_ENABLED: 'false',
      PUSH_DRIVER: 'memory',
      DASHBOARD_PROXY_SECRET: 'test-dashboard-proxy-secret-0123456789abcdef',
      PAYSTACK_SECRET_KEY: 'sk_test_e2e_webhook_secret',
    },
  },
});
