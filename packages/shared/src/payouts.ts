import { z } from 'zod';
import { otpCodeSchema } from './schemas.js';

export type PayoutMethod = 'bank' | 'mobile_money';

/** A bank or mobile money provider Paystack can pay out to in Ghana. */
export interface PayoutBank {
  code: string;
  name: string;
  method: PayoutMethod;
}

/** A gym's payout account, masked (the full number lives only at Paystack). */
export interface GymPayout {
  connected: boolean;
  method: PayoutMethod | null;
  bankName: string | null;
  accountName: string | null;
  accountLast4: string | null;
  updatedAt: string | null;
}

export const updatePayoutSchema = z.object({
  bankCode: z.string().trim().min(1).max(20),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{8,20}$/, 'Enter the account or mobile money number (digits only)')),
  accountName: z.string().trim().min(2, 'Enter the name on the account').max(80),
  /** Confirmation code emailed to the owner. */
  code: otpCodeSchema,
});
export type UpdatePayoutInput = z.input<typeof updatePayoutSchema>;
