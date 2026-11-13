# 01 — Product Requirements

## 1. Vision

Make it effortless for anyone in Ghana to find a gym near them, join it, pay for it, train with a coach, and get their gear — all from one app. For gyms, give them a digital front door: new members, online payments, a content channel, and member check-in tools.

Launch market: **Accra**. Currency: **GHS**. Primary payment method: **Mobile Money**, with cards supported.

## 2. Roles

| Role | Description | Surface |
|---|---|---|
| **Member** | End user. Can join multiple gyms at once. | Mobile app |
| **Gym owner / staff** | Runs a partner gym's presence on the platform. | Gym dashboard (web) |
| **Trainer** | Personal trainer associated with one gym. Receives bookings and is paid directly. | Trainer dashboard (web) |
| **Store partner** | Supplier who lists and fulfils store products. | Partner dashboard (web) |
| **Admin** | Platform team: approvals, store, finance, moderation, support. | Admin dashboard (web) |

All web dashboards must be fully responsive (phone, tablet, laptop, desktop). The gym dashboard in particular will be used on phones at the front desk to scan QR codes.

## 3. Mobile app — five bottom tabs

### 3.1 Home (feed)
- Shows posts (images, videos, text) **only from gyms the member has an active membership with**.
- Newest first; like and (later) comment.
- Empty state for members with no gyms: prompt to explore the Gyms tab.
- Entry point to the Store (banner/shortcut).

### 3.2 Workouts
- Library of animated, guided exercises and routines for training at home.
- **Free tier:** a small set of basic workouts available to everyone.
- **Unlocked tier:** full library unlocked for any member with **at least one active gym membership** *(assumption — see decisions doc)*.
- Licensed third-party exercise library (animations + instructions); we curate routines on top.
- Features: browse by body part/goal/equipment, workout player (animation, reps/timer, rest), history.

### 3.3 Gyms
- On first use, request location permission (or let the user pick a location on a map / search an area).
- Radius selector (e.g. 1, 3, 5, 10, 20 km). Results shown as list + map, sorted by distance.
- Filters: price range, facilities (AC, showers, parking, sauna…), opening hours, women-only, rating (later).
- **Gym page:** cover/photos, about, location & directions, hours, facilities, membership plans, trainers, feed.
- **Join:** choose a plan → pay via Paystack → receive receipt + membership QR code.
- Member can hold memberships at several gyms simultaneously.

### 3.4 Trainers
- Lists trainers associated with gyms (default: trainers at the member's gyms first, then nearby gyms).
- **Trainer profile:** photo, bio, specialties, certifications, gym, ratings (later), prices.
- Two booking models:
  - **Single session** — pick an available time slot from the trainer's calendar.
  - **Coaching package** — e.g. monthly package (N sessions / month) at a fixed price.
- Payment goes **directly to the trainer** (Paystack split — see payments doc).
- Booking confirmation, reminders, cancellation/reschedule according to trainer policy.

### 3.5 Me
- Profile (name, phone, photo, goals, basic body stats optional).
- **My memberships:** active/expired per gym, expiry date, renew button, QR code.
- **My bookings:** upcoming/past trainer sessions and packages.
- **My orders:** store orders and delivery tracking.
- Payment history & receipts, saved delivery addresses, notifications, settings, support, logout.

### 3.6 Store (reachable from Home and from inside any gym page)
- Categories: supplements, apparel, equipment, accessories.
- Product page, cart, checkout with **map-pinned delivery location** (live location or drag pin) + contact phone + notes.
- Delivery fee quoted at checkout; pay via Paystack; order tracking.

## 4. Gym dashboard (web)
- Onboarding: business details, location pin, photos, hours, facilities, bank/MoMo details for Paystack subaccount, documents for verification. Goes live after admin approval.
- **Plans:** create/edit membership plans (name, duration, price, description, active flag).
- **Members:** list of members with status (active/expiring/expired), plan, join and expiry dates, search.
- **Check-in:** scan member QR with device camera → instant valid/invalid result → check-in logged. Manual lookup by phone as fallback.
- **Feed:** create posts (images/video/text), edit/delete.
- **Trainers:** invite trainers to link to the gym, approve/remove.
- **Revenue:** payments received, platform fee, payouts (from Paystack data).
- Staff accounts with roles (owner, manager, front-desk).

## 5. Trainer dashboard (web)
- Profile, specialties, certifications, prices.
- Availability calendar (recurring weekly hours + exceptions).
- Single-session prices and coaching packages.
- Bookings: upcoming, history, accept/decline (if manual approval enabled), mark completed, client list.
- Earnings and payouts (own Paystack subaccount).
- Must be linked to an approved gym to be listed.

## 6. Partner (store) dashboard (web)
- Products: create/edit with images, price, variants (size/flavour), stock, category.
- Orders: new → preparing → ready for pickup → out for delivery → delivered; cancel/refund requests.
- Inventory levels and low-stock alerts.
- Sales and payouts.

## 7. Admin dashboard (web)
- Gym applications: review, approve/reject, suspend.
- Trainer oversight; user management; content moderation (reported posts).
- Store: manage own products, categories, partners, all orders, delivery issues.
- Finance: platform fee settings (per gym override), transactions, refunds, payouts reconciliation.
- Workout library curation (which workouts are free vs unlocked).
- Platform analytics: signups, active members, GMV, revenue by stream.

## 8. Cross-cutting requirements
- **Auth:** phone number + SMS OTP for members; email/phone + password (+OTP) for dashboards.
- **Notifications:** push (app), SMS for critical items (payment receipt, expiry reminders), in-app.
- **Receipts:** every payment produces a receipt (in-app, downloadable PDF later).
- **Performance on low bandwidth:** compressed images, adaptive video streaming, caching.
- **Data protection:** comply with Ghana's Data Protection Act, 2012 (Act 843); privacy policy & terms.
- **Localization:** English first; GHS formatting; Ghana Post GPS digital address as optional address field.

## 9. Revenue streams
1. Platform % fee on every gym membership payment.
2. Platform % fee on every trainer booking.
3. Store: margin on admin-listed products; commission on partner-listed products.
4. Later: promoted gym listings, premium gym tools.

## 10. Out of scope for v1
Comments/DMs/social graph, class scheduling (group classes), wearables integration, nutrition tracking, multi-city launch, multiple languages.
