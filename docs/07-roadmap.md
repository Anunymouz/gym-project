# 07 — Roadmap

Phases are ordered so we can launch a paying product early, then layer on.

## Phase 0 — Foundations
- ✅ BGYM brand kit (v1), wireframes, splash animation.
- ✅ BGYM name availability check. To do: domain + social handles, trademark filing (name and logo).
- ✅ Monorepo, CI, local environment, database schema + migrations, API foundation, web dashboard shell, mobile app shell with animated splash.
- Auth (Apple, Google, email one-time code): starts Phase 1.
- Business setup: Paystack account (+ confirm subaccount/MoMo details), Yango Delivery business contact, exercise-library licence, email provider, Apple & Google sign-in setup.

## Phase 1 — MVP: Gyms & memberships
- ✅ Sign-in with email codes (API + app): secure sessions, rate limits, audit log.
- ✅ Profile step; gym pages with plans and opening hours.
- ✅ Membership checkout (Paystack-ready, development simulator), verified activation, early-renewal extension, My memberships, rotating QR pass, staff check-in API.
- ✅ Gym dashboard on live data: secure sign-in, overview, members (filters, search), plans (create, edit, pause), front-desk QR scanner with email fallback, gym switcher, role-based access.
- ✅ Renewal reminder emails (7, 3 and 1 days before the end, and on the day it ends), plus a Remind button for gym staff; collapsible dashboard sidebar.
- ✅ Push notifications (renewal reminders, check-in confirmations) and notification settings in the app (Me → Notifications); one-click unsubscribe in emails.
- ✅ Gym Settings (profile, opening hours, facilities) and Revenue (monthly totals, CSV export).
- ✅ List your gym → setup checklist → payout account (Paystack subaccount, confirmed by email code) → send for review → BGYM team approves, sends back with a note, pauses or reactivates.
- ✅ Platform fee set by the BGYM team (Fees page, special rates per gym, change history); admin Payments page showing what BGYM earned; gyms see the fee and what they receive per plan.
- ✅ Gym photos: up to 12 per gym, cover photo, cleaned and resized on the server, gallery in the app; a photo is now part of the setup checklist.
- ✅ Staff: owners invite managers and front desk by email, change roles and remove people; a gym always keeps an owner.
- ✅ Payment receipts (email + Me → Payments & receipts) and changing the search area from Me.
- **Phase 1 status:** feature-complete for gyms and memberships. Still needed before launch: Apple & Google sign-in (needs Apple Developer + Google Cloud accounts), live Paystack test (needs test keys), Resend email domain, Cloudflare R2 bucket, hosting.
- Next: Apple & Google sign-in, live Paystack keys and gym subaccounts.
- Member: onboarding, location + radius search, gym page, buy membership (MoMo/card), receipt, QR, My memberships, renewal reminders.
- Gym dashboard: onboarding, plans, members list, QR scanning check-in, revenue view.
- Admin: gym approval, fee settings, transactions.
- Paystack subaccounts + splits + webhooks.
- **Goal:** sign up the first batch of Accra gyms and take real payments.

## Phase 2 — Feed & trainers
- Gym posts and Home feed. **Done:** owners and managers post from the dashboard (text, up to 4 photos or a video); members see posts from gyms they belong to and can like, comment, share and report; the BGYM team handles reports in the admin dashboard.
- Gym communities. **Done:** members with an active membership post to their gym (text, up to 4 photos or a video up to 3 minutes); stories from gyms and members (a photo or a video up to 60 seconds, gone after 24 hours) in a tray at the top of Home; comments; share links with a preview page; blocking; community rules before the first post; gym owners and managers moderate their community. Video: Cloudflare Stream in production (needs an account), converted on the API in development.
- Trainers and bookings. **Done:** gyms invite trainers by email; the trainer dashboard covers schedule, bookings (complete, no-show, cancel), clients, packages, weekly hours and time off, earnings, profile, photo and payout account (Paystack subaccount). Members find trainers in the Trainers tab and on gym pages, book a time and pay (split straight to the trainer minus BGYM's trainer fee) or use a package session, cancel within the trainer's notice period for a refund, and get reminders a day and an hour before. The BGYM team sets the trainer fee and can pause trainers.
- **Later:** reschedule in one step (today: cancel and rebook), ratings and reviews, trainers applying to a gym themselves, an optional gym share of trainer payments, Paystack refund webhooks (refunds are marked "pending" until then).

## Phase 3 — Store
- **Done:** partner dashboard (orders, products with photos and options, inventory, payouts, pickup point); admin Store & partners (review queue, partners and commission, BGYM's own products, every order, delivery pricing); member store (browse, search, categories, product pages, cart, map-pinned delivery address, checkout with delivery fees, one payment split between sellers, order tracking, cancel before preparation). Paystack refund events mark refunds complete.
- **Delivery today:** manual. Fees are a base plus a per-km rate up to a maximum distance (set by the BGYM team); the seller or BGYM enters the rider's name and phone, and the member sees them.
- **Later:** Yango Delivery API (automatic quotes and dispatch) once BGYM has a business account and API access; returns after delivery; product reviews; promo codes.

## Phase 4 — Workouts
- Licensed exercise library import, workout builder in admin, free vs unlocked.
- Workout player and history.

*(Workouts can move earlier — it's largely content and doesn't depend on payments beyond the unlock check.)*

## Phase 5 — Growth
- Ratings & reviews (gyms, trainers, products), comments, promoted listings, referral codes, card auto-renew, analytics dashboards, expansion beyond Accra.

## Next immediate steps
1. Review and sign off these documents.
2. Low-fidelity wireframes for the 5 app tabs and the gym dashboard.
3. Scaffold the monorepo (mobile, web, api, shared).
4. Start Phase 1 build.
