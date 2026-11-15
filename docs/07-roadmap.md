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
- Next: payment receipts, change search area in the app, Apple & Google sign-in, live Paystack keys and gym subaccounts.
- Member: onboarding, location + radius search, gym page, buy membership (MoMo/card), receipt, QR, My memberships, renewal reminders.
- Gym dashboard: onboarding, plans, members list, QR scanning check-in, revenue view.
- Admin: gym approval, fee settings, transactions.
- Paystack subaccounts + splits + webhooks.
- **Goal:** sign up the first batch of Accra gyms and take real payments.

## Phase 2 — Feed & trainers
- Gym posts (images/video) and Home feed.
- Trainer dashboard: profile, availability, single sessions, packages, earnings.
- Member: Trainers tab, booking flows, booking reminders.
- Trainer subaccounts and booking payments.

## Phase 3 — Store
- Partner dashboard: products, variants, stock, orders.
- Admin store management.
- Member: store browsing, cart, map-based address, checkout, order tracking.
- Yango Delivery integration (quote + dispatch) with manual fallback.

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
