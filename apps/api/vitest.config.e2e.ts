import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      LOG_LEVEL: 'silent',
      MAIL_DRIVER: 'memory',
      JWT_ACCESS_SECRET: 'test-jwt-secret-0123456789abcdefghijklmnopqrstuv',
      OTP_PEPPER: 'test-otp-pepper-0123456789abcdefghijklmnopqrstuv',
    },
  },
});
