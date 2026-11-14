# Security

## Reporting a vulnerability

Please do **not** open a public issue. Email the BGYM team privately with the details and steps to reproduce. We aim to acknowledge reports within 3 working days.

## How BGYM is built to be secure

**Secrets and configuration**
- No secrets in the repository. Each app has a `.env.example`; real `.env` files are git-ignored.
- The API validates every environment variable at startup and refuses to boot when config is invalid (for example, production without a CORS allowlist).
- Anything prefixed `NEXT_PUBLIC_` or `EXPO_PUBLIC_` ships to users' devices and must never hold a secret.

**API**
- Security headers via helmet (HSTS, nosniff, frame protection, CSP); `x-powered-by` removed.
- CORS restricted to an explicit allowlist.
- Global rate limiting (stricter limits on sign-in endpoints as they are added).
- All input validated with shared zod schemas; database access through Prisma or tagged-template raw SQL with bound parameters, never string concatenation.
- Structured logs with per-request IDs; authorization headers, cookies, emails and one-time codes are redacted.
- Integrity rules enforced in the database too (positive prices, valid totals, valid date ranges).

**Authentication (Phase 1)**
- Sign in with Apple, Google, or a one-time email code. No passwords for members.
- Only hashes of one-time codes and refresh tokens are stored; codes expire and have attempt limits.
- Short-lived access tokens with rotating refresh tokens, stored in the iOS Keychain / Android Keystore via SecureStore.
- Sensitive actions (approvals, refunds, fee and role changes) are written to an append-only audit log.

**Payments (Phase 1)**
- Paystack webhooks are verified by signature and processed idempotently (each event id stored once); nothing is activated from client-side callbacks alone.

**Web dashboards**
- Strict security headers (CSP, HSTS, `X-Frame-Options: DENY`, Permissions-Policy with camera limited to our own pages for QR check-in).
- Self-hosted fonts and assets; no third-party scripts.
- Planned: nonce-based CSP once dashboards are authenticated.

**Mobile app**
- Minimum permissions: location "while using the app" only. Background location and microphone are blocked; Android backups are disabled.

**Supply chain**
- pnpm only runs install scripts for allow-listed packages, and refuses dependency versions published less than 3 days ago (Expo SDK packages, pinned by Expo's template, are exempt).
- Lockfile committed; CI installs with `--frozen-lockfile`.
- Dependabot updates, `pnpm audit` in CI, and CodeQL code scanning.

**Privacy**
- Personal data is kept to what each feature needs, in line with Ghana's Data Protection Act, 2012 (Act 843).
