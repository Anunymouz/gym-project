import { z } from 'zod';

export const checkoutSchema = z.object({ planId: z.uuid('Choose a plan') });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const paymentReferenceSchema = z.string().regex(/^bgym_[0-9a-f]{32}$/, 'Unknown payment');

export interface CheckoutResponse {
  reference: string;
  membershipId: string;
  amountPesewas: number;
  provider: 'paystack' | 'dev';
  /** Paystack's secure checkout page (MoMo and cards). Null for development payments. */
  authorizationUrl: string | null;
}

export interface PaymentStatusResponse {
  reference: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  membershipId: string | null;
}

export interface MembershipSummary {
  id: string;
  status: 'active' | 'expired' | 'pending' | 'cancelled';
  startsAt: string;
  endsAt: string;
  gym: { name: string; slug: string; coverUrl: string | null; addressText: string };
  plan: { name: string; durationDays: number; pricePesewas: number };
}

/** Short-lived token encoded in the member's QR code. */
export interface MembershipPass {
  token: string;
  expiresAt: string;
}

export const checkInSchema = z.object({
  gymId: z.uuid(),
  token: z.string().min(20).max(2000),
});
export type CheckInInput = z.infer<typeof checkInSchema>;

export interface CheckInResponse {
  result: 'ok' | 'expired' | 'wrong_gym' | 'invalid';
  member: { name: string | null } | null;
  plan: string | null;
  endsAt: string | null;
}

export const PASS_TTL_SECONDS = 60;
export const PASS_REFRESH_SECONDS = 30;
