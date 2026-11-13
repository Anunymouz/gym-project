# 07 — Roadmap

Phases are ordered so we can launch a paying product early, then layer on.

## Phase 0 — Foundations
- Name and brand direction (see decisions doc), design system, app & dashboard wireframes.
- Monorepo, CI, environments, database, auth (phone OTP).
- Business setup: Paystack account (+ confirm subaccount/MoMo details), Yango Delivery business contact, exercise-library licence, SMS provider.

## Phase 1 — MVP: Gyms & memberships
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
