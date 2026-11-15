import { z } from 'zod';

// ── Rules ──
/** Sessions can be booked this far ahead, and no later than this before they start. */
export const BOOKING_HORIZON_DAYS = 30;
export const MIN_NOTICE_MINUTES = 120;
/** An unpaid single session holds its slot for this long while the member pays. */
export const BOOKING_HOLD_MINUTES = 15;
/** Slots start every half hour within the trainer's hours. */
export const SLOT_STEP_MINUTES = 30;
export const SESSION_DURATIONS = [30, 45, 60, 90] as const;
export const MAX_BOOKING_NOTE = 300;
/** Africa/Accra is GMT all year (no daylight saving), so trainer hours are stored as UTC times. */
export const TRAINER_TIME_ZONE = 'Africa/Accra';
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 06:30');
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const timeToMinutes = toMinutes;
export const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ── Trainer profile (trainer dashboard) ──
export const trainerProfileSchema = z.object({
  bio: z.string().trim().min(30, 'Tell members a bit more about you (at least 30 characters)').max(800, 'Keep it under 800 characters'),
  specialties: z.array(z.string().trim().min(2).max(40)).min(1, 'Add at least one specialty').max(8, 'Up to 8 specialties'),
  certifications: z.array(z.string().trim().min(2).max(100)).max(10, 'Up to 10 certifications'),
  sessionPricePesewas: z.number().int().min(500, 'A session costs at least GH₵5').max(500_000, 'That price looks too high'),
  sessionDurationMin: z.union(SESSION_DURATIONS.map((d) => z.literal(d)) as [z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>, z.ZodLiteral<90>]),
  cancelHours: z.number().int().min(0).max(72),
});
export type TrainerProfileInput = z.infer<typeof trainerProfileSchema>;

export const SPECIALTY_SUGGESTIONS = ['Strength', 'Weight loss', 'Bodybuilding', 'HIIT', 'Mobility', 'Boxing', 'Running', 'Pre & postnatal', 'Seniors', 'Sports performance', 'Yoga', 'Rehab'] as const;

// ── Availability ──
export const availabilityRuleSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: time, endTime: time })
  .refine((r) => toMinutes(r.endTime) > toMinutes(r.startTime), { message: 'The end time must be after the start time', path: ['endTime'] });
export const availabilitySchema = z
  .object({ rules: z.array(availabilityRuleSchema).max(28) })
  .refine(
    (v) =>
      v.rules.every((a, i) =>
        v.rules.every((b, j) => i === j || a.weekday !== b.weekday || toMinutes(a.endTime) <= toMinutes(b.startTime) || toMinutes(b.endTime) <= toMinutes(a.startTime)),
      ),
    { message: 'Hours on the same day can’t overlap', path: ['rules'] },
  );
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type AvailabilityRule = z.infer<typeof availabilityRuleSchema>;

/** A day off (or part of a day): no bookings then. */
export const timeOffSchema = z
  .object({ date: z.iso.date(), startTime: time.optional(), endTime: time.optional() })
  .refine((v) => (v.startTime === undefined) === (v.endTime === undefined), { message: 'Give both times, or neither for the whole day', path: ['endTime'] })
  .refine((v) => !v.startTime || !v.endTime || toMinutes(v.endTime) > toMinutes(v.startTime), { message: 'The end time must be after the start time', path: ['endTime'] });
export type TimeOffInput = z.infer<typeof timeOffSchema>;

export interface TrainerAvailability {
  rules: AvailabilityRule[];
  timeOff: Array<{ id: string; date: string; startTime: string | null; endTime: string | null }>;
}

// ── Packages ──
export const trainerPackageSchema = z.object({
  name: z.string().trim().min(3, 'Give the package a name').max(60),
  description: z.string().trim().max(300).optional(),
  sessionsCount: z.number().int().min(2, 'At least 2 sessions').max(50),
  validityDays: z.number().int().min(7, 'At least a week').max(180, 'At most 6 months'),
  pricePesewas: z.number().int().min(1000).max(5_000_000),
});
export type TrainerPackageInput = z.infer<typeof trainerPackageSchema>;

export interface TrainerPackageItem {
  id: string;
  name: string;
  description: string | null;
  sessionsCount: number;
  validityDays: number;
  pricePesewas: number;
  isActive: boolean;
}

// ── What members see ──
export interface TrainerCard {
  id: string;
  name: string;
  photoUrl: string | null;
  specialties: string[];
  sessionPricePesewas: number;
  sessionDurationMin: number;
  gym: { id: string; name: string; slug: string };
  /** Trainer at a gym where the viewer has an active membership. */
  atMyGym: boolean;
  fromPesewas: number;
}

export interface TrainerDetail extends TrainerCard {
  bio: string;
  certifications: string[];
  cancelHours: number;
  packages: TrainerPackageItem[];
  /** The viewer's active packages with this trainer (sessions they can book without paying). */
  myPackages: MyPackage[];
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}
export interface DaySlots {
  date: string;
  slots: Slot[];
}

export const bookSessionSchema = z.object({
  startsAt: z.iso.datetime(),
  /** Use a session from a package instead of paying. */
  packagePurchaseId: z.uuid().optional(),
  note: z.string().trim().max(MAX_BOOKING_NOTE).optional(),
});
export type BookSessionInput = z.infer<typeof bookSessionSchema>;

export interface BookingCheckout {
  bookingId: string | null;
  packagePurchaseId: string | null;
  /** null when no payment is needed (booked with a package). */
  reference: string | null;
  amountPesewas: number;
  provider: 'paystack' | 'dev' | null;
  authorizationUrl: string | null;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface MyBooking {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  trainer: { id: string; name: string; photoUrl: string | null; phone: string | null };
  gym: { name: string; slug: string; addressText: string };
  paidWith: 'payment' | 'package';
  note: string | null;
  /** Free cancellation (refund or session back) until then. */
  freeCancelUntil: string;
  cancelledBy: 'member' | 'trainer' | 'system' | null;
  refundDue: boolean;
}

export interface MyPackage {
  id: string;
  name: string;
  trainer: { id: string; name: string };
  sessionsCount: number;
  sessionsRemaining: number;
  endsAt: string;
}

// ── Trainer dashboard ──
export type TrainerSetupStep = 'profile' | 'photo' | 'availability' | 'payout';
export interface TrainerMe {
  id: string;
  name: string | null;
  email: string;
  status: 'pending' | 'active' | 'suspended';
  listed: boolean;
  gym: { id: string; name: string };
  bio: string | null;
  specialties: string[];
  certifications: string[];
  sessionPricePesewas: number;
  sessionDurationMin: number;
  cancelHours: number;
  photoUrl: string | null;
  /** What's left before they can be listed in the app. */
  missing: TrainerSetupStep[];
  feeBps: number;
}

export interface TrainerBooking {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  client: { id: string; name: string; email: string; phone: string | null };
  paidWith: 'payment' | 'package';
  note: string | null;
  cancelledBy: 'member' | 'trainer' | 'system' | null;
}

export interface TrainerClient {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  sessions: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  activePackage: { name: string; sessionsRemaining: number; endsAt: string } | null;
}

export interface TrainerEarnings {
  month: string;
  months: string[];
  totals: { payments: number; grossPesewas: number; feePesewas: number; netPesewas: number };
  payments: Array<{ id: string; paidAt: string; kind: 'session' | 'package'; description: string; client: string; grossPesewas: number; feePesewas: number; refunded: boolean }>;
}

export const trainerBookingActionSchema = z.object({ action: z.enum(['complete', 'no_show', 'cancel']) });

// ── Gym dashboard ──
export const inviteTrainerSchema = z.object({ email: z.email('Enter a valid email address').trim().toLowerCase().max(254) });

export interface GymTrainers {
  trainers: Array<{
    id: string;
    name: string | null;
    email: string;
    status: 'pending' | 'active' | 'suspended';
    listed: boolean;
    specialties: string[];
    sessionPricePesewas: number;
    upcomingBookings: number;
    joinedAt: string;
  }>;
  invitations: Array<{ id: string; email: string; createdAt: string; expiresAt: string; invitedBy: string | null }>;
}

export interface MyTrainerInvitation {
  id: string;
  gym: { id: string; name: string };
  invitedBy: string | null;
  expiresAt: string;
}

// ── Admin ──
export interface AdminTrainer {
  id: string;
  name: string | null;
  email: string;
  gym: string;
  status: 'pending' | 'active' | 'suspended';
  listed: boolean;
  sessionPricePesewas: number;
  bookings: number;
  feeBps: number | null;
  createdAt: string;
}
