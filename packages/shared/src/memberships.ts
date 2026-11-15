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

/** A successful payment as the member sees it. */
export interface ReceiptSummary {
  id: string;
  /** Short, human receipt number, e.g. BGYM-4723ED0D. */
  number: string;
  paidAt: string;
  amountPesewas: number;
  channel: string | null;
  /** e.g. "Monthly · Iron Haven Fitness" */
  title: string;
}

export interface Receipt extends ReceiptSummary {
  reference: string;
  member: { name: string | null; email: string };
  gym: { name: string; addressText: string; phone: string | null } | null;
  plan: string | null;
  period: { startsAt: string; endsAt: string } | null;
}

/** BGYM-XXXXXXXX from the payment reference (bgym_<32 hex>). */
export const receiptNumber = (reference: string) => `BGYM-${reference.replace(/^bgym_/, '').slice(0, 8).toUpperCase()}`;

const CHANNEL_LABELS: Record<string, string> = { mobile_money: 'Mobile money', card: 'Card', bank: 'Bank', other: 'Other' };
export const paymentChannelLabel = (channel: string | null) => (channel ? (CHANNEL_LABELS[channel] ?? channel) : '—');
