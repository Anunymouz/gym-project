# 03 — Payments Design (Paystack)

All payments go through the platform's Paystack account (Ghana, GHS). Money is routed to the right party with **subaccounts** and **split payments**, so the platform fee is deducted automatically at payment time and we never manually hold and forward gym/trainer money.

## 1. Who gets a subaccount

| Party | Subaccount | Created when |
|---|---|---|
| Gym | Yes | Gym submits payout details during onboarding |
| Trainer | Yes | Trainer submits payout details |
| Store partner | Yes | Admin onboards partner |
| Platform | Main account | — |

Payout destination: bank account or mobile money wallet (whatever Paystack supports for GH settlement at integration time — confirm with Paystack).

## 2. Payment types and splits

| Payment | Recipient(s) | Platform fee |
|---|---|---|
| Gym membership | Gym subaccount | Configurable %, default set by admin, overridable per gym |
| Trainer single session | Trainer subaccount | Configurable % |
| Trainer coaching package | Trainer subaccount | Configurable % |
| Store item (admin-listed) | Platform main account | 100% to platform |
| Store item (partner-listed) | Partner subaccount | Configurable commission % |
| Delivery fee | Platform main account | Platform pays courier |

**Optional gym cut on trainer bookings:** since trainers are associated with gyms, some gyms may want a share. Paystack's multi-split supports more than one subaccount per transaction, so the model supports `trainer + gym + platform` splits. Default for v1: gym share = 0% (pending decision).

**Paystack fees:** decide who bears Paystack's processing fee (`bearer` setting) — recommended: the **subaccount** (gym/trainer/partner) bears it, or bake it into the platform %. Paystack lists the GH mobile-money charge at about 1.95% per transaction (verify current pricing).

**Mixed store carts** (items from admin + partner): either use a dynamic multi-split for that transaction or restrict v1 to a single seller per order. Recommendation: dynamic split computed at checkout.

## 3. Flow (any payment)

1. App calls our API → API creates a pending `Payment` record and initializes a Paystack transaction (amount, email/phone, `subaccount` or `split_code`, metadata: payment type + entity IDs).
2. App opens Paystack checkout (MoMo prompt or card).
3. **Paystack webhook** `charge.success` → API verifies signature + re-verifies transaction → marks payment succeeded → activates membership / confirms booking / confirms order (idempotent).
4. Receipt generated, notifications sent.

Never activate anything from the client callback alone — the webhook (with server-side verification) is the source of truth.

## 4. Renewals — important constraint

Paystack does **not** support recurring charges on mobile money: a MoMo customer can't be auto-debited each month. Therefore:

- **MoMo users (majority):** manual renewal. Reminders at 7/3/1/0 days before expiry; one-tap renew opens payment again. Grace period configurable per gym (default 0 days).
- **Card users:** optional auto-renew using Paystack's saved authorization (charge_authorization) on the expiry date, with the same split applied. Retry on failure, then fall back to manual renewal.

## 5. Refunds & disputes
- Refunds initiated by admin via Paystack refund API. Note that a refund on a split transaction affects the subaccount's settlement — policy must be agreed with gyms/trainers/partners in their terms.
- Booking cancellations: full refund if cancelled ≥ X hours before; otherwise per trainer policy.
- Store: refund on cancellation before dispatch, or after a valid return claim.

## 6. Reconciliation
- Store every Paystack event and our own payment records; nightly job reconciles against Paystack transactions and settlements.
- Dashboards show gross, platform fee, Paystack fee, net per party.

## 7. To confirm with Paystack before building
- Subaccount settlement to MoMo wallets in Ghana.
- Multi-split behaviour on GH mobile money transactions.
- Current fees and settlement schedule.
- Any limits on number of subaccounts.
