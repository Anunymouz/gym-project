# 06 — Architecture & Tech Stack

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native + Expo** (TypeScript) | One codebase for iOS & Android, OTA updates, strong ecosystem (maps, camera, notifications) |
| Web dashboards | **Next.js** (TypeScript) + Tailwind CSS + component library (e.g. shadcn/ui) | Responsive by default, fast to build, shares types with backend |
| Backend API | **NestJS** (Node.js, TypeScript), REST + OpenAPI | Structured modules, guards for role-based access, good for a growing team |
| Database | **PostgreSQL + PostGIS** | Relational data + geospatial radius search |
| ORM | Prisma (raw SQL for PostGIS queries) | Type-safe models and migrations |
| Background jobs | Redis + BullMQ | Renewal reminders, expiry processing, webhook handling, reconciliation |
| Media | Object storage (S3-compatible, e.g. Cloudflare R2/AWS S3) for images; a video service (e.g. Mux or Cloudflare Stream) for feed videos | Adaptive streaming for low-bandwidth users |
| Payments | **Paystack** (subaccounts, splits, webhooks) | Ghana MoMo + cards |
| Delivery | **Yango Delivery API** behind a `DeliveryProvider` interface | Auto quote + dispatch |
| Maps | Google Maps Platform (Maps SDK, Places, Geocoding) | Best Accra coverage |
| Auth | Sign in with Apple, Google Sign-In, email one-time codes (own implementation or a managed auth service) | No passwords for members; Apple sign-in is required by the App Store when Google is offered |
| Email | Transactional email provider (e.g. Resend, Postmark, Amazon SES) | Login codes, receipts, reminders |
| SMS (optional, later) | Ghanaian SMS provider (e.g. Arkesel, mNotify, Hubtel) | Critical reminders only |
| Push | Expo Notifications (FCM/APNs underneath) | |
| Exercise content | Licensed exercise library with animations (evaluate commercial licence terms) | Fast and cheap vs producing our own |
| Monitoring | Sentry (errors), structured logs, uptime checks | |

## 2. Repository layout (monorepo)

```
/apps
  /mobile        Expo app (members)
  /web           Next.js — route groups: /gym, /trainer, /partner, /admin
  /api           NestJS backend
/packages
  /shared        Shared types, validation schemas (zod), constants
  /ui            Shared web UI components
/docs            Planning documents
```

Tooling: pnpm workspaces + Turborepo, ESLint, Prettier, GitHub Actions CI.

**One web app vs four:** one Next.js app with role-based route groups shares login, layout and components and is faster to build. The admin area can be split into its own deployment later if we want stricter isolation.

## 3. Backend modules
`auth` · `users` · `gyms` · `memberships` · `checkins` · `feed` · `trainers` · `bookings` · `workouts` · `store` · `orders` · `delivery` · `payments` (Paystack client, webhooks, splits) · `notifications` · `media` · `admin` · `reports`.

## 4. Security
- Role-based access control on every endpoint (member, gym staff with gym scope, trainer, partner, admin).
- **QR check-in codes:** signed, short-lived tokens (rotate every ~30–60 s in the app) containing membership ID + expiry, so a screenshot can't be reused later. Server validates signature, gym, and membership status.
- Paystack webhook signature verification; idempotent processing.
- Rate limiting on OTP and login; OTP expiry and attempt limits.
- Signed upload URLs for media; content moderation queue.
- PII minimisation; compliance with Ghana's Data Protection Act (Act 843).

## 5. Environments & deployment
- `dev`, `staging`, `production`; Paystack test keys in dev/staging.
- API + workers in containers on a managed platform (e.g. AWS, Render, Railway, Fly) close to West Africa where possible; managed Postgres with PostGIS.
- Web on Vercel or the same platform.
- Mobile builds via Expo EAS → App Store / Play Store; OTA updates for JS changes.

## 6. As built (Phase 0 foundation, November 2026)

| Area | Choice in the code |
|---|---|
| Monorepo | pnpm 10 workspaces + Turborepo; packages `@bgym/api`, `@bgym/web`, `@bgym/mobile`, `@bgym/shared` |
| Mobile | Expo SDK 58 (React Native 0.88), Expo Router with JS tabs, Reanimated 4 + react-native-svg, Outfit font, Phosphor icons |
| Web | Next.js 16 (App Router, Cache Components), Tailwind CSS 4, self-hosted Outfit, Phosphor icons |
| API | NestJS 12 (Express adapter), zod validation via Standard Schema, helmet, throttler, pino, terminus, Swagger outside production |
| Database | PostgreSQL 17 + PostGIS 3.5, Prisma 7 with the `pg` driver adapter; raw SQL (bound parameters) for geo queries |
| Local services | Docker Compose: PostGIS, Redis |
| CI | GitHub Actions (lint, typecheck, tests, builds, API e2e on PostGIS, mobile bundling, audit), CodeQL, Dependabot |

**Icons:** Phosphor (MIT) on web and mobile, using duotone/fill weights for active states, instead of a generic default set. Apple and Google sign-in buttons use their official marks; on iOS, Phase 1 switches to Apple's native sign-in button as Apple requires.
