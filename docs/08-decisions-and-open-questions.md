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

## Assumptions (please confirm or correct)

| # | Assumption |
|---|---|
| A1 | Any active membership at **any** gym unlocks the full workout library (not a separate workout subscription). |
| A2 | A trainer belongs to exactly **one** gym at a time. |
| A3 | Gyms get **no** share of trainer booking payments by default (can be enabled per gym). |
| A4 | Members don't need to be a member of a trainer's gym to book that trainer. |
| A5 | Unused package sessions expire at the end of the package period. |
| A6 | Store is prepaid only (no cash on delivery) in v1. |
| A7 | Gyms are verified/approved by admin before appearing in search. |

## Open questions
1. Platform fee percentages for memberships, trainer bookings, and partner store sales.
2. Who bears Paystack processing fees — the gym/trainer/partner, or built into the platform fee?
3. Refund and cancellation policies (memberships, bookings, store orders).
4. Store partner: single warehouse location? Do they also want to self-deliver?
5. Membership start: always on payment date, or can the member choose a future start date?

## Naming

We don't have a name yet. Goals for the name: short, easy to say in Ghana and abroad, tells the story (find your gym / strength / community), available as a domain and on app stores, trademark-safe.

Starting directions to explore:
- **Rooted in Ghanaian languages:** e.g. *Ahoɔden* (Twi for "strength"), *Nkwa* (Twi for "life") — distinctive and local, with a story to tell.
- **Descriptive / modern:** names combining *gym, fit, rep, pass, hub* — clear about what the app does.
- **Access / pass framing:** the app as your key to every gym nearby.

Next step: shortlist ~10 candidates, check domain/app-store/trademark availability, and test with a few target users.
