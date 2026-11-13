# 08 — Decisions & Open Questions

## Decisions made

| # | Decision |
|---|---|
| D1 | Mobile app for members on iOS and Android. |
| D2 | Responsive web dashboards for gyms, trainers, store partner, and admin. |
| D3 | Payment confirmation shows on the gym dashboard; member receives receipt + QR code which the gym scans. |
| D4 | Members can hold memberships at multiple gyms. |
| D5 | Five app tabs: Home (feed), Workouts, Gyms, Trainers, Me. |
| D6 | Paystack for all payments; each gym has a subaccount; platform takes a % of every subscription. |
| D7 | Trainers are associated with a gym, have their own dashboard, and are **paid directly** (own subaccount). |
| D8 | Trainer booking supports both single time slots and coaching packages. |
| D9 | Home feed shows posts only from gyms the member belongs to. |
| D10 | Workouts: a few basic workouts free; full library unlocked by paying for a gym membership. |
| D11 | Workout animations from a licensed exercise library. |
| D12 | Store partner gets a web dashboard to upload products; admin can also upload products. |
| D13 | Delivery address set via live location / map pin at checkout; platform handles delivery. |
| D14 | Delivery: on-demand courier API (Yango Delivery) primary, manual dispatch fallback (recommended, pending Yango confirmation). |
| D15 | Tech stack: React Native (Expo), Next.js, NestJS, PostgreSQL + PostGIS. |
| D16 | A trainer belongs to exactly **one** gym at a time. |
| D17 | Members don't need to be a member of a trainer's gym to book that trainer. |
| D18 | Store is **prepaid only** — payment is taken at checkout and the order is confirmed only after payment succeeds. No cash on delivery. |
| D19 | An active membership at **any** gym unlocks the full Workouts library. |
| D20 | ~~Product name Orbyt~~, superseded by D21. |
| D21 | Product name is **BGYM**, short for "Be my Gym buddy". Logo: muscled athlete raising dumbbells inside a tilted orbit ring (see `brand/`). |
| D22 | Member sign-in: Apple, Google, or email + one-time code. No phone-number verification. |
| D23 | App opens with an animated BGYM splash screen, then sign-in. |
| D24 | Store entry points: floating Store bar on the Gyms tab, Store button at the top of every gym page, and the Home banner. |

## Assumptions (please confirm or correct)

| # | Assumption |
|---|---|
| A3 | Gyms get **no** share of trainer booking payments by default (can be enabled per gym). |
| A5 | Unused package sessions expire at the end of the package period. |
| A7 | Gyms are verified/approved by admin before appearing in search. |

## Open questions
1. Platform fee percentages for memberships, trainer bookings, and partner store sales.
2. Who bears Paystack processing fees — the gym/trainer/partner, or built into the platform fee?
3. Refund and cancellation policies (memberships, bookings, store orders).
4. Store partner: single warehouse location? Do they also want to self-deliver?
5. Membership start: always on payment date, or can the member choose a future start date?

## Naming

**Decided: BGYM**, short for **"Be my Gym buddy."** It replaces Orbyt, which is kept for reference in [09 — Name check](09-name-check-orbyt.md) and `brand/archive/orbyt/`.

- **Story:** the app that finds your gym, your trainer and your training partner. The orange **B** is the "Be", the invitation.
- **Logo:** a muscled athlete in a double-biceps pose raising orange dumbbells, circled by a tilted orbit ring with an orange dot. It keeps the Orbyt colour palette (Midnight + Flare).
- **Availability:** see [10 — Name check: BGYM](10-name-check-bgym.md). Clear in Ghana and Africa; a Taiwanese fitness-equipment brand uses BGYM and has a pending US trademark in Class 28.
- **To do:** app store name "BGYM: Be my gym buddy"; secure a domain (bgym.app / getbgym.com) and @bgymapp handles; file the Ghana trademark; have a lawyer clear the name and the logo (muscled-figure gym logos are common).
