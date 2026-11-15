/** Renewal reminders: emailed automatically, and on demand by gym staff. */
export type ReminderKind = 'days_7' | 'days_3' | 'days_1' | 'expired' | 'manual';

/** Staff can remind the same membership at most once in this period (any reminder counts). */
export const MANUAL_REMINDER_COOLDOWN_HOURS = 24;

/** Automatic reminders are only emailed during these Accra hours (inclusive start, exclusive end). */
export const REMINDER_SEND_HOURS = { from: 7, to: 21 } as const;

export interface RemindResponse {
  remindedAt: string;
}
