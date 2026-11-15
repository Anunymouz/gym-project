import { z } from 'zod';
import { ghanaPhoneSchema } from './schemas.js';

// ── Rules ──
export const MAX_PRODUCT_PHOTOS = 8;
export const MAX_PRODUCT_VARIANTS = 20;
/** An unpaid order holds its stock for this long. */
export const ORDER_HOLD_MINUTES = 15;
export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;
export const MAX_SAVED_ADDRESSES = 10;

/** Where BGYM delivers for now: Ghana (a rough box, refined by the delivery distance limit). */
const lat = z.number().min(4.5).max(11.3);
const lng = z.number().min(-3.4).max(1.3);

// ── Catalogue ──
export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ProductCard {
  id: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  pricePesewas: number;
  compareAtPricePesewas: number | null;
  inStock: boolean;
  seller: string;
  category: string;
}

export interface ProductVariantItem {
  id: string;
  name: string;
  pricePesewas: number;
  compareAtPricePesewas: number | null;
  /** How many can be added now (stock not held by others), capped for display. */
  available: number;
}

export interface ProductDetail extends ProductCard {
  description: string | null;
  images: Array<{ url: string; thumbUrl: string; width: number; height: number }>;
  variants: ProductVariantItem[];
}

export const storeQuerySchema = z.object({
  category: z.string().regex(/^[a-z0-9-]+$/).max(40).optional(),
  q: z.string().trim().max(60).optional(),
  cursor: z.string().max(200).optional(),
});
export type StoreQuery = z.infer<typeof storeQuerySchema>;
export interface StorePage {
  products: ProductCard[];
  nextCursor: string | null;
}

// ── Seller dashboard: products ──
export const variantInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, 'Name each option, e.g. "1 kg · Chocolate"').max(60),
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, 'Use letters, numbers, dots and dashes'),
    pricePesewas: z.number().int().min(100, 'At least GH₵1').max(10_000_000),
    compareAtPricePesewas: z.number().int().min(100).max(10_000_000).nullable().optional(),
    stock: z.number().int().min(0).max(100_000),
    weightGrams: z.number().int().min(1).max(100_000).nullable().optional(),
  })
  .refine((v) => !v.compareAtPricePesewas || v.compareAtPricePesewas > v.pricePesewas, { message: 'The “was” price must be higher than the price', path: ['compareAtPricePesewas'] });

export const productInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the product a name').max(120),
    description: z.string().trim().max(3000).optional(),
    brand: z.string().trim().max(60).optional(),
    categoryId: z.uuid('Choose a category'),
    variants: z.array(variantInputSchema).min(1, 'Add at least one option with a price').max(MAX_PRODUCT_VARIANTS),
  })
  .refine((v) => new Set(v.variants.map((x) => x.sku)).size === v.variants.length, { message: 'Each option needs its own SKU', path: ['variants'] });
export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;

export type ProductStatus = 'draft' | 'pending_review' | 'active' | 'archived';

export interface SellerProduct {
  id: string;
  title: string;
  brand: string | null;
  description: string | null;
  categoryId: string;
  status: ProductStatus;
  reviewNote: string | null;
  isFeatured: boolean;
  images: Array<{ id: string; url: string; thumbUrl: string }>;
  variants: Array<{ id: string; name: string; sku: string; pricePesewas: number; compareAtPricePesewas: number | null; stock: number; reserved: number; weightGrams: number | null; isActive: boolean }>;
  sold: number;
  updatedAt: string;
}

/** Seller actions on a product. Partners "submit" for review; BGYM's own products go live directly. */
export const productStatusActionSchema = z.object({ action: z.enum(['publish', 'unpublish', 'archive']) });
export const productReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve') }),
  z.object({ decision: z.literal('reject'), note: z.string().trim().min(5, 'Tell the partner what to change').max(500) }),
]);
export const stockAdjustSchema = z.object({ stock: z.number().int().min(0).max(100_000) });

// ── Partners ──
export const createPartnerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contactEmail: z.email().trim().toLowerCase(),
  contactPhone: ghanaPhoneSchema,
  commissionBps: z.number().int().min(0).max(5000),
});
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;

export const pickupLocationSchema = z.object({
  addressText: z.string().trim().min(3).max(200),
  latitude: lat,
  longitude: lng,
  contactPhone: ghanaPhoneSchema,
});
export type PickupLocationInput = z.infer<typeof pickupLocationSchema>;

export interface SellerAccount {
  id: string;
  type: 'platform' | 'partner';
  name: string;
  commissionBps: number;
  isActive: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  pickup: { id: string; addressText: string; latitude: number; longitude: number; contactPhone: string } | null;
  payoutConnected: boolean;
  users: Array<{ id: string; name: string | null; email: string }>;
  products: { active: number; pending: number };
}

// ── Cart and addresses ──
export const cartLineSchema = z.object({ variantId: z.uuid(), quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY) });
export type CartLineInput = z.infer<typeof cartLineSchema>;

export interface CartLine {
  variantId: string;
  productId: string;
  title: string;
  variantName: string;
  thumbUrl: string | null;
  unitPricePesewas: number;
  quantity: number;
  /** How many can be bought now; less than quantity means the cart needs fixing. */
  available: number;
  seller: { id: string; name: string };
}
export interface Cart {
  lines: CartLine[];
  subtotalPesewas: number;
  count: number;
}

export const addressSchema = z.object({
  label: z.string().trim().max(30).optional(),
  latitude: lat,
  longitude: lng,
  addressText: z.string().trim().min(3, 'Describe where to deliver').max(200),
  landmark: z.string().trim().max(120).optional(),
  gpsDigitalAddress: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}-?\d{3,4}-?\d{3,4}$/, 'Use a GhanaPost GPS address like GA-123-4567')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  contactPhone: ghanaPhoneSchema,
});
export type AddressInput = z.infer<typeof addressSchema>;
export interface SavedAddress extends Omit<AddressInput, 'gpsDigitalAddress'> {
  id: string;
  gpsDigitalAddress: string | null;
  isDefault: boolean;
}

// ── Checkout ──
export const checkoutQuoteSchema = z.object({ addressId: z.uuid() });
export const storeCheckoutSchema = z.object({ addressId: z.uuid(), note: z.string().trim().max(300).optional() });
export type StoreCheckoutInput = z.infer<typeof storeCheckoutSchema>;

export interface CheckoutQuote {
  orders: Array<{ seller: string; subtotalPesewas: number; deliveryFeePesewas: number; distanceKm: number; lines: number }>;
  subtotalPesewas: number;
  deliveryPesewas: number;
  totalPesewas: number;
  /** Something that stops checkout (out of stock, too far…), in plain words. */
  problem: string | null;
}

export interface StoreCheckout {
  reference: string;
  orderIds: string[];
  amountPesewas: number;
  provider: 'paystack' | 'dev';
  authorizationUrl: string | null;
}

// ── Orders ──
export type OrderStatus = 'pending_payment' | 'paid' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'delivery_failed' | 'cancelled' | 'refunded';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Order placed',
  preparing: 'Being prepared',
  ready_for_pickup: 'Ready for the rider',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  delivery_failed: 'Delivery problem',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export interface OrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  seller: string;
  items: Array<{ title: string; quantity: number; unitPricePesewas: number; thumbUrl: string | null }>;
  subtotalPesewas: number;
  deliveryFeePesewas: number;
  totalPesewas: number;
  createdAt: string;
  address: { addressText: string; landmark: string | null; latitude: number; longitude: number; contactPhone: string };
  note: string | null;
  events: Array<{ status: OrderStatus; note: string | null; at: string }>;
  delivery: { provider: 'manual' | 'yango'; courierName: string | null; courierPhone: string | null; trackingUrl: string | null } | null;
  refundDue: boolean;
}

/** What a seller sees: the order plus who to deliver to. */
export interface SellerOrder extends OrderSummary {
  customer: { name: string; phone: string };
  commissionPesewas: number;
}

export const orderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preparing') }),
  z.object({ action: z.literal('ready') }),
  z.object({ action: z.literal('dispatch'), courierName: z.string().trim().min(2).max(60), courierPhone: ghanaPhoneSchema, trackingUrl: z.url().optional() }),
  z.object({ action: z.literal('delivered') }),
  z.object({ action: z.literal('failed'), note: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().min(3).max(300) }),
]);
export type OrderAction = z.infer<typeof orderActionSchema>;

/** Delivery pricing set by the BGYM team: a base fee plus a rate per km, up to a maximum distance. */
export const deliverySettingsSchema = z.object({
  baseFeePesewas: z.number().int().min(0).max(100_000),
  perKmPesewas: z.number().int().min(0).max(10_000),
  maxKm: z.number().int().min(1).max(200),
});
export type DeliverySettings = z.infer<typeof deliverySettingsSchema>;
export const DEFAULT_DELIVERY: DeliverySettings = { baseFeePesewas: 1500, perKmPesewas: 300, maxKm: 40 };

export const ORDER_NUMBER = (n: number) => `BG-${n}`;
