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
| D24 | Store entry points: "Go to the BGYM Store" on the location & radius step after sign-in (no gym needed), floating Store bar on the Gyms tab, Store button at the top of every gym page, and the Home banner. |
| D25 | Sign-in sessions: 15-minute access tokens + 30-day rotating refresh tokens with reuse detection; email codes hashed with a server pepper; every API route private unless marked public. Transactional email via Resend (to confirm). |
| D26 | Payments: Paystack checkout page (MoMo + cards); activation only from verified webhooks; renewal before expiry extends from the current end date; platform fee read from settings (per-gym override), 0 until decided. |
| D27 | Profile step after sign-up: name (required), fitness goal and MoMo number (optional). |
| D29 | Renewal reminders are emailed 7, 3 and 1 days before a membership ends and once on the day it ends, between 07:00 and 21:00 Accra time. Plans shorter than a week get none, the 7-day reminder needs a plan of 28+ days and the 3-day one 14+ days, and members who already renewed get none. Gym staff (any role) can also send one from the dashboard, at most once a day per member. Push reminders follow with app notifications. |
| D30 | Notifications: members choose per topic and channel (renewals: phone + email, on by default; check-ins: phone, on; news and offers: phone + email, off until they opt in). The app asks for phone permission only when the member turns notifications on, never at launch. Every reminder email has a one-click unsubscribe. Sign-in codes and payment receipts are always emailed. Push goes through Expo's push service. |
| D31 | Gyms join through the dashboard: "List your gym" creates a hidden draft; the owner completes a checklist (description and phone, opening hours, a plan, payout account) and sends it for review; the BGYM team approves it (live), sends it back with a note, or later pauses it. A person can have up to three gyms in progress. |
| D32 | Payout accounts are Paystack subaccounts. Only owners can see or change them; every change needs a fresh code from the owner's email, is audited, and every owner is emailed. BGYM stores only the bank name, account name and last four digits. |
| D33 | BGYM's fee is set by the BGYM team in the admin dashboard (Fees): one default percentage for memberships, plus optional special rates per gym. Each payment is split at Paystack: BGYM's fee goes to BGYM's Paystack account (transaction charge), the rest to the gym's subaccount, which bears Paystack's processing fee. The fee in force at checkout is stored on the payment, so changes never alter past payments. Real checkout is refused for a gym without a payout account. |
| D34 | Gym photos: up to 12 per gym (first = cover), uploaded by owners and managers. The server re-encodes every photo to WebP (1600 px and a 480 px thumbnail), which also strips EXIF metadata such as GPS. Stored on disk in development and in S3-compatible storage (Cloudflare R2 recommended) behind a CDN in production. A gym needs at least one photo before it can be sent for review. |
| D37 | Gym communities: members with an active membership can post (text, up to 4 photos or one video up to 3 minutes) and add stories (one photo or a video up to 60 seconds, 24 hours) to their gym. Members' posts, comments and stories are seen only by that gym's active members and staff; a gym's own posts stay public on its page. Anyone in the community can like and comment; share links open a web preview that shows a gym's post in full but only says where a member's post is from. Members can block each other (both stop seeing each other's content) and must accept community rules before posting; gym owners and managers can delete anything in their community, and the BGYM team handles reports of posts, comments and stories. |
| D38 | Video: Cloudflare Stream in production. Phones upload straight to Stream with one-time URLs that enforce the length limit; playback links are signed and expire after 6 hours, so members-only videos can't be passed around. Development (and small deployments) can use the API's own converter (ffmpeg: H.264, at most 1280 px, metadata removed). Unused uploads are deleted after a day; stories and their files an hour after they expire. |
| D41 | Store sellers: BGYM's own products (run from the admin dashboard, live when published) and store partners set up by the BGYM team with a commission (default 15% suggested). Partners' new products, and changes to a live product's details, are checked by the BGYM team before members see them; prices and stock change straight away. Options that have been sold are switched off, never deleted. |
| D42 | Store checkout: a cart can mix sellers. It becomes one order per seller (each ships from its own pickup point and has its own delivery fee), paid with one payment that Paystack splits: each partner gets their items minus commission, BGYM keeps its own items, the commissions and the delivery fees (and pays the riders). Stock is held for 15 minutes while paying. Members can cancel until the seller starts preparing; sellers can cancel until it's out for delivery; both refund that order in full and restock. |
| D43 | Delivery starts manual: fee = base + per km (straight-line distance × 1.3), up to a maximum distance, all set in admin (defaults GH₵15 + GH₵3/km, 40 km). The seller (or BGYM) hands the order to a rider and enters their name and phone. A courier API (Yango) plugs in behind the same quote/dispatch steps later. |
| D39 | Trainers join through their gym: an owner or manager invites them by email, which makes the gym's approval implicit. A trainer belongs to one gym at a time. They appear in the app only once their profile, photo, weekly hours and payout account are set and they switch on their listing. Removing a trainer (gym or BGYM team) cancels and refunds their upcoming sessions. |
| D40 | Booking rules: times every 30 minutes inside the trainer's hours, from 2 hours to 30 days ahead, in Accra time (GMT, no daylight saving). An unpaid single session holds its slot for 15 minutes. Payments are split at Paystack: BGYM's trainer fee (set in admin, default 0%, with optional per-trainer rates) to BGYM, the rest to the trainer's subaccount, which bears Paystack's fee. The gym takes no share for now. Members cancel free (refund, or session back on their package) until the trainer's notice period (2–48 hours, default 24); trainers can cancel any time and members always get their money back. Package sessions expire with the package. |
| D36 | Gym posts: owners and managers post text and up to 4 photos (processed like gym photos). The Home feed shows posts from gyms where the member has an active membership; a gym's page shows its posts to anyone. Only members of that gym can like; any signed-in person can report a post once, and the BGYM team dismisses the report or removes the post (audited). Video comes later. |
| D35 | Gym staff join by invitation to their email address; only someone signed in with that address can accept (no secret links). Owners manage everyone and change roles; managers invite and remove front desk only. Removing someone ends their access immediately, and a gym can never lose its last owner. |
| D28 | Dashboards sign in with the same email code; sessions are held by the dashboard's server in httpOnly cookies (the browser never holds a token). Front-desk staff can check members in and view members and plans; only owners and managers change plans. |

## Assumptions (please confirm or correct)

| # | Assumption |
|---|---|
| A3 | Gyms get **no** share of trainer booking payments by default (can be enabled per gym). |
| A5 | Unused package sessions expire at the end of the package period. |
| A7 | Gyms are verified/approved by admin before appearing in search. |

## Open questions
1. ~~Platform fee for memberships~~: now set in the admin dashboard (D33). Still to decide: fees for trainer bookings and partner store sales.
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
