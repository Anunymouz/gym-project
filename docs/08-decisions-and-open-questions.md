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
| D20 | Product name is **Orbyt**; app store listing name is **Orbyt Fit**. |

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

**Decided: Orbyt.** Listed in the app stores as **Orbyt Fit**.

- **Story:** "Everything that moves you, in your orbit." The app draws a circle around you (location + radius) with the gyms, trainers and gear inside it, and the orbit moves with you wherever you go.
- **Why not a local name:** we plan to expand beyond Ghana, so the name must work internationally.
- **Known risk:** a US trademark for ORBYT in the mobile-app class (Axis 80) may require a different name or a coexistence agreement if we enter the US. See [09 — Name check](09-name-check-orbyt.md).
- **To do:** register the domain (orbyt.fit / orbytfit.com / getorbyt.com), claim the @orbytfit handles, and have a lawyer file the trademark in Ghana.
