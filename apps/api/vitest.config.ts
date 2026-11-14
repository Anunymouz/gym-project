import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    env: {
      LOG_LEVEL: 'silent',
      MAIL_DRIVER: 'memory',
      JWT_ACCESS_SECRET: 'test-jwt-secret-0123456789abcdefghijklmnopqrstuv',
      OTP_PEPPER: 'test-otp-pepper-0123456789abcdefghijklmnopqrstuv',
    },
  },
});
