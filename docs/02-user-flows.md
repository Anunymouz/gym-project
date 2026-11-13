# 02 — User Flows

## Member

### M1. Sign up / onboarding
1. Open app → splash → short intro carousel (find gyms, train, shop).
2. Enter phone number → receive SMS OTP → verify.
3. Enter name (+ optional photo, fitness goal).
4. Request location permission → if denied, pick area on map / search.
5. Choose search radius → land on Gyms tab with nearby results.

### M2. Find and join a gym
1. Gyms tab → list/map of gyms within radius → apply filters.
2. Tap gym → gym page (photos, plans, trainers, feed preview, directions).
3. Tap a plan → review (price, duration, start date = today or chosen date).
4. Pay with Paystack (MoMo prompt on phone, or card).
5. Webhook confirms payment → membership becomes **active** → receipt + QR shown; push + SMS sent.
6. Gym dashboard shows new member immediately.

### M3. Gym check-in
1. Member opens Me → My memberships → selects gym → QR displayed (rotating, short-lived).
2. Front desk scans with gym dashboard (phone/laptop camera).
3. Server validates: correct gym, membership active, not expired → ✅ green / ❌ red with reason.
4. Check-in logged (member sees visit history).

### M4. Renew membership
1. Reminders at 7 days, 3 days, 1 day before expiry and on expiry day (push + SMS).
2. Tap Renew → pay → new period starts at old expiry (if not yet lapsed) or today (if lapsed).
3. Card payers may opt into auto-renew.

### M5. Book a trainer — single session
1. Trainers tab (or gym page → Trainers) → trainer profile.
2. Choose "Single session" → pick date → available slots shown → pick slot.
3. Pay → booking confirmed → appears in Me → My bookings, and in trainer dashboard.
4. Reminders 24h and 1h before. Cancel/reschedule per trainer policy.

### M6. Book a trainer — coaching package
1. Trainer profile → "Packages" → choose package (e.g. 8 sessions / month).
2. Pay → package active with session balance.
3. Book individual sessions against the balance (same slot picker, no extra payment).
4. Package expires at end of period; unused sessions handling per policy (default: expire).

### M7. Workouts
1. Workouts tab → browse free workouts, locked ones show a lock badge.
2. Tap locked → "Join any gym to unlock the full library" → CTA to Gyms tab.
3. Start workout → player (animation, reps/timer, rest) → complete → saved to history.

### M8. Store purchase
1. Store (from Home or from a gym page) → browse/search → product → choose variant → add to cart.
2. Checkout → delivery location: use live location or drop pin on map → add landmark/notes + contact phone (save address).
3. System returns delivery fee quote → shows total.
4. Pay → order created → partner/admin notified.
5. Tracking: Confirmed → Preparing → Picked up → Delivered (with courier details/live link when available).

### M9. Home feed
1. Home tab shows posts from member's active gyms, newest first.
2. Tap gym name → gym page. Like a post. Report inappropriate content.

## Gym

### G1. Onboarding
1. Sign up on web → business info, owner details.
2. Location (map pin), photos, hours, facilities.
3. Payout details (bank or MoMo) → Paystack subaccount created.
4. Submit for review → admin approves → gym goes live in search.

### G2. Daily operations
Create plans · post to feed · scan check-ins · view members & expiring list · invite trainers · view revenue.

## Trainer

### T1. Onboarding
1. Receives invite link from gym (or applies and selects gym → gym approves).
2. Profile, specialties, certifications, photos.
3. Payout details → own Paystack subaccount.
4. Set weekly availability, session price, packages → listed in app.

### T2. Daily operations
View/approve bookings · mark sessions completed · manage calendar exceptions · view earnings.

## Store partner

### P1. Operations
1. Admin creates partner account → partner sets payout details (Paystack subaccount).
2. Upload products (images, price, variants, stock).
3. New order alert → mark Preparing → Ready for pickup → delivery dispatched (see store doc) → Delivered.

## Admin

### A1. Operations
Approve gyms · moderate content · manage store catalogue and partners · handle order issues & refunds · set fees · curate workout library · view analytics.
