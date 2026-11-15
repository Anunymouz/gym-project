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

**Authentication** (email codes live; Apple and Google next)
- No passwords for members: a 6-digit code by email (Apple and Google sign-in to follow).
- Codes come from a cryptographically secure generator, expire after 10 minutes, allow 5 attempts, and only the newest code is valid. They are stored as an HMAC keyed with a server-side pepper, so a database leak can't be brute-forced; comparison is constant-time and consumption is atomic (a code works once, even under concurrent requests).
- Requesting a code always returns the same response, so it can't be used to discover which emails have accounts. A 30-second resend cooldown, 5 codes per hour per address, and per-client rate limits on every auth endpoint stop email bombing and guessing.
- Sessions: 15-minute access tokens (HS256 JWT with issuer and audience checks) and 30-day refresh tokens that rotate on every use and are stored only as hashes. Reusing an old refresh token is treated as theft and revokes every session on the account.
- On the phone the refresh token lives in the iOS Keychain / Android Keystore (this device only, never restored from backups); the access token is kept in memory.
- Every API route requires sign-in unless explicitly marked public.
- Raw IP addresses are never stored, only peppered hashes. Sign-ups, sign-ins, failed codes and token reuse are written to an append-only audit log.
- The API refuses to start in production with development secrets, a missing CORS allowlist, or the development mail driver.

**Payments**
- Prices always come from the database at checkout; the amount sent by the app is ignored.
- Memberships activate only after a verified payment: Paystack webhooks must carry a valid HMAC-SHA512 signature, and with live payments the transaction is re-verified with Paystack's API. Nothing is activated from the app's own callback.
- Each provider event is processed exactly once (unique event id, in the same database transaction as the activation); replays are ignored. A charge whose amount or currency differs from the order is refused and audited.
- Card and MoMo details are entered only on Paystack's page; BGYM never sees them.
- The development payment simulator is refused in production, as are Paystack test keys.

**Gym check-in**
- The member's QR code is a signed token valid for 60 seconds and refreshed every 30, so screenshots expire almost immediately. It uses its own audience, so it can never be used as a sign-in token.
- Only staff of that gym (or BGYM admins) can check members in; every scan, including invalid ones, is recorded.

**Notifications**
- Push tokens are tied to the account that signed in last on that phone and removed on sign-out; tokens Expo reports as dead are deleted.
- Unsubscribe links are signed with their own key and audience, last a year, and can only turn emails off. The page needs a button press (link scanners don't unsubscribe anyone); one-click unsubscribe follows RFC 8058 and only accepts POST.
- Members' choices are checked before every reminder, including ones staff send from the dashboard.

**Web dashboards**
- Strict security headers (CSP, HSTS, `X-Frame-Options: DENY`, Permissions-Policy with camera limited to our own pages for QR check-in).
- Self-hosted fonts and assets; no third-party scripts.
- Sessions live in `httpOnly`, `SameSite=Lax` cookies (`Secure` with the `__Host-` prefix in production), so page scripts can never read a token. The browser never calls the API: the dashboard's server does, and `connect-src` is `'self'`.
- Sign-in, sign-out and every change are server actions (Next.js checks their origin). The access token is renewed in `proxy.ts` before it expires; link prefetches never rotate the refresh token.
- The gym being managed is always resolved on the server from the person's own staff list, never taken from the browser. The API re-checks the role on every call (front desk is read-only for plans).
- Sign-in redirects only go back into the dashboards (no open redirects).
- The API rate-limits each visitor, not the dashboard server as a whole: the dashboard passes the visitor's IP with a shared secret (`DASHBOARD_PROXY_SECRET`), and the API ignores that header from anyone else.
- Planned: nonce-based CSP.

**Mobile app**
- Minimum permissions: location "while using the app" only. Background location and microphone are blocked; Android backups are disabled.

**Supply chain**
- pnpm only runs install scripts for allow-listed packages, and refuses dependency versions published less than 3 days ago (Expo SDK packages, pinned by Expo's template, are exempt).
- Lockfile committed; CI installs with `--frozen-lockfile`.
- Dependabot updates, `pnpm audit` in CI, and CodeQL code scanning.

**Privacy**
- Personal data is kept to what each feature needs, in line with Ghana's Data Protection Act, 2012 (Act 843).
