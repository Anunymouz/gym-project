import { z } from 'zod';

/**
 * BGYM's fee on payments, in basis points (1% = 100 bps, 2.5% = 250 bps). Paystack's own
 * processing fee is separate: it comes out of the gym's share (the gym's subaccount bears it).
 */
export const MAX_FEE_BPS = 3000; // 30%: a sanity cap against typos

export const feeBpsSchema = z.number().int('Use at most two decimal places').min(0, 'The fee can’t be negative').max(MAX_FEE_BPS, 'The fee can’t be more than 30%');

/** "2.5" (percent, as typed) → 250 bps. */
export const percentToBps = (percent: number) => Math.round(percent * 100);
export const bpsToPercent = (bps: number) => bps / 100;
export const formatPercent = (bps: number) => `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;

/** BGYM's fee on an amount, exactly as charged at checkout. */
export const feeFor = (amountPesewas: number, bps: number) => Math.round((amountPesewas * bps) / 10_000);

export const updateFeeSettingsSchema = z.object({ membershipBps: feeBpsSchema });
export type UpdateFeeSettingsInput = z.infer<typeof updateFeeSettingsSchema>;

/** null removes the gym's own rate, so it follows the default again. */
export const gymFeeOverrideSchema = z.object({ bps: feeBpsSchema.nullable() });

export interface FeeSettings {
  membershipBps: number;
  updatedAt: string | null;
  history: Array<{ at: string; by: string | null; gym: string | null; fromBps: number | null; toBps: number | null }>;
}

/** What a gym pays BGYM on each membership sale. */
export interface GymFee {
  bps: number;
  /** "gym" when the BGYM team set a special rate for this gym. */
  source: 'default' | 'gym';
}

export const adminPaymentsQuerySchema = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional() });

export interface AdminPaymentsMonth {
  month: string;
  months: string[];
  totals: { payments: number; grossPesewas: number; feePesewas: number; gymsPesewas: number };
  byGym: Array<{ gymId: string; gym: string; payments: number; grossPesewas: number; feePesewas: number; feeBps: number | null }>;
}
