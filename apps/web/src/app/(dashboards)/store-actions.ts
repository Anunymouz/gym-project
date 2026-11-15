'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createPartnerSchema,
  deliverySettingsSchema,
  MAX_PHOTO_BYTES,
  orderActionSchema,
  pickupLocationSchema,
  productInputSchema,
  productReviewSchema,
  updatePayoutSchema,
  type CreatePartnerInput,
  type DeliverySettings,
  type GymPayout,
  type OrderAction,
  type PickupLocationInput,
  type ProductInput,
  type SellerAccount,
  type SellerOrder,
  type SellerProduct,
  type UpdatePayoutInput,
} from '@bgym/shared';
import { api, ApiError, apiUpload } from '@/lib/api.server';

/**
 * Store actions for the two seller views: a partner's dashboard ("partner") and BGYM's own
 * store in the admin dashboard ("own"). The scope only picks the API path; the API checks the
 * person's role and seller on every request.
 */
const scopeSchema = z.enum(['partner', 'own']);
type Scope = z.infer<typeof scopeSchema>;
const base = (scope: Scope) => (scope === 'partner' ? '/v1/partner' : '/v1/admin/store/own');
const ordersBase = (scope: Scope) => (scope === 'partner' ? '/v1/partner/orders' : '/v1/admin/store/orders');
const page = (scope: Scope) => (scope === 'partner' ? '/partner' : '/admin/store');
const id = z.uuid();

type Result<T> = { data?: T; error?: string; fieldErrors?: Record<string, string> };

async function call<T>(scope: Scope, fn: (b: string) => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn(base(scope));
    revalidatePath(page(scope), 'layout');
    return { data };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' };
  }
}

function errorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.map(String).join('.') || 'form'] ??= issue.message;
  return out;
}

function checkScope(scope: string): Scope {
  return scopeSchema.parse(scope);
}

// ── Products ──

export async function saveProduct(scopeIn: string, productId: string | null, input: ProductInput): Promise<Result<SellerProduct>> {
  const scope = checkScope(scopeIn);
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };
  if (productId && !id.safeParse(productId).success) return { error: 'Product not found.' };
  return call(scope, (b) => api<SellerProduct>(productId ? `${b}/products/${productId}` : `${b}/products`, { method: productId ? 'PUT' : 'POST', body: JSON.stringify(parsed.data) }));
}

export async function productStatus(scopeIn: string, productId: string, action: 'publish' | 'unpublish' | 'archive'): Promise<Result<SellerProduct>> {
  const scope = checkScope(scopeIn);
  const act = z.enum(['publish', 'unpublish', 'archive']).safeParse(action);
  if (!id.safeParse(productId).success || !act.success) return { error: 'Product not found.' };
  return call(scope, (b) => api<SellerProduct>(`${b}/products/${productId}/status`, { method: 'POST', body: JSON.stringify({ action: act.data }) }));
}

export async function uploadProductPhoto(scopeIn: string, productId: string, form: FormData): Promise<Result<SellerProduct>> {
  const scope = checkScope(scopeIn);
  if (!id.safeParse(productId).success) return { error: 'Product not found.' };
  const photo = form.get('photo');
  if (!(photo instanceof File) || photo.size === 0) return { error: 'Choose a photo.' };
  if (photo.size > MAX_PHOTO_BYTES) return { error: 'That photo is too big (10 MB at most).' };
  const out = new FormData();
  out.append('photo', photo, 'photo');
  return call(scope, (b) => apiUpload<SellerProduct>(`${b}/products/${productId}/photos`, out));
}

export async function productPhotoAction(scopeIn: string, productId: string, imageId: string, action: 'remove' | 'cover'): Promise<Result<SellerProduct>> {
  const scope = checkScope(scopeIn);
  if (!id.safeParse(productId).success || !id.safeParse(imageId).success) return { error: 'Photo not found.' };
  return call(scope, (b) =>
    action === 'remove'
      ? api<SellerProduct>(`${b}/products/${productId}/photos/${imageId}`, { method: 'DELETE' })
      : api<SellerProduct>(`${b}/products/${productId}/photos/${imageId}/cover`, { method: 'POST' }),
  );
}

export async function setStock(scopeIn: string, variantId: string, stock: number): Promise<Result<SellerProduct>> {
  const scope = checkScope(scopeIn);
  const n = z.number().int().min(0).max(100_000).safeParse(stock);
  if (!id.safeParse(variantId).success || !n.success) return { error: 'Enter a whole number.' };
  return call(scope, (b) => api<SellerProduct>(`${b}/variants/${variantId}/stock`, { method: 'PUT', body: JSON.stringify({ stock: n.data }) }));
}

// ── Orders ──

export async function orderAction(scopeIn: string, orderId: string, action: OrderAction): Promise<Result<SellerOrder>> {
  const scope = checkScope(scopeIn);
  const parsed = orderActionSchema.safeParse(action);
  if (!id.safeParse(orderId).success) return { error: 'Order not found.' };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the details.' };
  try {
    const data = await api<SellerOrder>(`${ordersBase(scope)}/${orderId}`, { method: 'POST', body: JSON.stringify(parsed.data) });
    revalidatePath(page(scope), 'layout');
    return { data };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' };
  }
}

// ── Pickup and payout ──

export async function savePickup(scopeIn: string, input: PickupLocationInput): Promise<Result<SellerAccount>> {
  const scope = checkScope(scopeIn);
  const parsed = pickupLocationSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };
  return call(scope, (b) => api<SellerAccount>(`${b}/pickup`, { method: 'PUT', body: JSON.stringify(parsed.data) }));
}

export async function requestPartnerPayoutCode(): Promise<{ error?: string }> {
  try {
    await api<void>('/v1/partner/payout/code', { method: 'POST' });
    return {};
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}

export async function savePartnerPayout(input: UpdatePayoutInput): Promise<{ saved?: GymPayout; error?: string; fieldErrors?: Record<string, string> }> {
  const parsed = updatePayoutSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };
  try {
    const saved = await api<GymPayout>('/v1/partner/payout', { method: 'PUT', body: JSON.stringify(parsed.data) });
    revalidatePath('/partner', 'layout');
    return { saved };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong.' };
  }
}

// ── BGYM team ──

async function adminCall<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath('/admin/store', 'layout');
    return { data };
  } catch (err) {
    return { error: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' };
  }
}

export async function reviewProduct(productId: string, decision: { decision: 'approve' } | { decision: 'reject'; note: string }): Promise<Result<void>> {
  const parsed = productReviewSchema.safeParse(decision);
  if (!id.safeParse(productId).success) return { error: 'Product not found.' };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return adminCall(() => api<void>(`/v1/admin/store/review/${productId}`, { method: 'POST', body: JSON.stringify(parsed.data) }));
}

export async function createPartner(input: CreatePartnerInput): Promise<Result<SellerAccount>> {
  const parsed = createPartnerSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: errorsOf(parsed.error) };
  return adminCall(() => api<SellerAccount>('/v1/admin/store/partners', { method: 'POST', body: JSON.stringify(parsed.data) }));
}

export async function updatePartner(sellerId: string, input: { commissionBps?: number; isActive?: boolean }): Promise<Result<SellerAccount>> {
  const parsed = z.object({ commissionBps: z.number().int().min(0).max(5000).optional(), isActive: z.boolean().optional() }).safeParse(input);
  if (!id.safeParse(sellerId).success || !parsed.success) return { error: 'Check the details.' };
  return adminCall(() => api<SellerAccount>(`/v1/admin/store/partners/${sellerId}`, { method: 'PATCH', body: JSON.stringify(parsed.data) }));
}

export async function saveDeliverySettings(input: DeliverySettings): Promise<Result<DeliverySettings>> {
  const parsed = deliverySettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the numbers.' };
  return adminCall(() => api<DeliverySettings>('/v1/admin/store/delivery', { method: 'PUT', body: JSON.stringify(parsed.data) }));
}

export async function setFeatured(productId: string, isFeatured: boolean): Promise<Result<void>> {
  if (!id.safeParse(productId).success) return { error: 'Product not found.' };
  return adminCall(() => api<void>(`/v1/admin/store/products/${productId}/featured`, { method: 'PUT', body: JSON.stringify({ isFeatured: isFeatured === true }) }));
}
