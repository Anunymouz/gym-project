# 04 — Store & Delivery

## 1. Store model

The store is owned by the platform. Products come from two sources:

- **Admin-listed products** — the platform sells directly.
- **Partner-listed products** — our supplier partner uploads and manages their own products through the **Partner dashboard**; we earn a commission.

The data model is multi-vendor from day one (every product belongs to a `seller`: either the platform or a partner), so adding more partners later costs nothing.

## 2. Catalogue
- Categories (supplements, apparel, equipment, accessories) and subcategories.
- Product: title, description, images, brand, price, compare-at price, variants (size, colour, flavour), SKU, stock per variant, weight/size class (for delivery), status (draft/active/archived).
- Admin can feature products and approve partner products before they go live (optional moderation switch).

## 3. Order lifecycle

```
PENDING_PAYMENT → PAID → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED
                    ↘ CANCELLED / REFUNDED            ↘ DELIVERY_FAILED → (retry | refund)
```

- **Prepaid only, no cash on delivery.** The member pays in-app at checkout (MoMo or card); the order is confirmed only after Paystack confirms the payment.
- Stock is reserved at checkout and released if payment isn't completed within N minutes.
- Seller (partner or admin) moves the order through PREPARING → READY_FOR_PICKUP.
- Delivery is dispatched when the order is ready (see below).

## 4. Delivery — recommendation

### Options considered
| Option | Pros | Cons |
|---|---|---|
| A. Partner delivers with own riders | Simple, no integration | Inconsistent service, manual fee pricing, no live tracking, hard to scale |
| B. Our own rider fleet | Full control | Expensive, operational burden — not where we should spend early |
| C. **On-demand courier API (Yango Delivery)** | Automatic price quote, automatic dispatch, courier tracking, covers Accra/Tema (and Kumasi) | Requires business account + API access; per-trip cost; dependency on provider |

Yango Delivery operates in Accra and Tema and offers a B2B API with price estimation and delivery creation. I could not find public Ghana-specific API documentation, so access, pricing and endpoints must be confirmed with Yango's Ghana business team. I did not find a public delivery API for Bolt in Ghana.

### Recommended approach
1. **Primary: Yango Delivery API.**
   - At checkout: call the provider's price-estimate endpoint with the partner's pickup point and the member's pinned location → show delivery fee → member pays product total + delivery fee.
   - When seller marks READY_FOR_PICKUP: create the delivery request automatically → store courier/tracking info → push status updates to the member.
   - Delivery fee goes to the platform main account; platform pays Yango through its business account.
2. **Fallback: manual dispatch.** If the API is unavailable or the address is out of coverage, the order falls back to "manual delivery" — admin or partner arranges a rider and updates status by hand. Fee for fallback uses a distance-based table (base fee + per-km).
3. **Build a `DeliveryProvider` interface** (`quote`, `create`, `cancel`, `track`) so we can add another courier or our own riders later without touching order logic.

### Pickup location
Each seller has one or more pickup addresses with map coordinates. Phase 1 assumes a single partner warehouse plus (optionally) a platform warehouse.

## 5. Delivery address capture
- Live location (GPS) **or** drag a pin on the map; reverse-geocode to a readable address.
- Required: contact phone. Optional: landmark/notes, Ghana Post GPS digital address.
- Saved addresses in Me.

## 6. To confirm
- Yango Ghana business account, API access, pricing, coverage, and insurance on goods.
- Does the partner want to also offer self-delivery (Option A) in addition?
