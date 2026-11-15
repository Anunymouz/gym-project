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

**Gyms and payouts**
- Admin routes (`@Roles('admin')`) check the person's roles in the database on every request, so removing someone's admin role takes effect immediately.
- Review decisions and status changes are conditional updates (a gym is decided on exactly once, even if two admins click at once), and every one is audited.
- Payout changes need a step-up code from the owner's email. Codes are tied to a purpose: a sign-in code can't confirm a payout change and a payout code can't sign anyone in. Every owner is emailed when payout details change.
- Full account numbers go to Paystack only; BGYM keeps the bank, account name and last four digits.
- Revenue CSV exports neutralise spreadsheet formulas (CSV injection).
- Only the BGYM team can change fees (audited, with history); the fee is fixed on each payment when it's created. Real checkout is refused for a gym with no payout account, so a gym's money can never be collected into BGYM's account by mistake.

**Photos**
- Uploads are capped (10 MB, one file, 50 megapixels) and held in memory, never written to disk unprocessed.
- The file's claimed type is ignored: the image is decoded and re-encoded to WebP, so only real JPEG/PNG/WebP images get through, and all metadata (including the GPS location phones record) is removed.
- Storage keys are generated by the server and checked against a strict pattern before any read, write or delete (no path traversal); only owners and managers can change photos, and every change is audited.

**Staff**
- Invitations are tied to an email address and can only be accepted by a person signed in with it (their sign-in code proves ownership), exactly once; there is no secret link to forward or leak.
- Role rules are enforced by the API (owners: anyone; managers: front desk only). Team changes lock the gym's staff rows, so concurrent changes can't remove the last owner. Every change is audited.

**Posts, stories and comments**
- One set of rules decides who sees what (`CommunityAccessService`): a gym's own posts are public; members' posts, comments and stories only reach that gym's active members and staff. Anything else answers 404, so post IDs can't be probed.
- Only members with an active membership can post to a gym, and only after accepting the community rules. Gym owners and managers can delete anything in their community (audited); the BGYM team removes reported posts, comments and stories (audited) and every open report on them is closed.
- Blocking works both ways and applies everywhere: the feed, comments, stories and single posts.
- Reports are one per person per item. Nobody but the BGYM team sees who reported.
- Photos go through the same processing as gym photos (re-encoded, metadata removed), all checked before anything is saved.
- Videos: an upload ticket belongs to one person and is used once (conditional update), and a video can be attached to one post or story. In development the API checks the file with ffprobe (it must really be a video, within the length limit), converts it with ffmpeg run without a shell and with a time limit, and strips all metadata, including GPS. Uploads go to a temp file with a random name (never into memory) and are deleted afterwards. In production videos go straight to Cloudflare Stream through one-time URLs with a length limit, and playback links are signed RS256 tokens that expire after 6 hours.
- The dashboard's video upload route only accepts same-origin multipart requests (route handlers don't get server actions' CSRF check), streams the body without holding it, and the API still checks the ticket's owner.
- Like, view and comment counts are exact under double taps (conditional inserts and deletes in transactions).

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
- `proxy.ts` sends people to a dashboard they have a role for, reading the roles in their access token. It doesn't verify the token (the dashboard server never holds the signing key), so this is routing only: the API verifies the token and the role on every data request.
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
