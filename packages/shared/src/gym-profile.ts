import { z } from 'zod';
import type { OpeningHours } from './gyms.js';
import { ghanaPhoneSchema } from './schemas.js';

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export const WEEK_DAY_LABELS: Record<WeekDay, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/** Facilities a gym can list. A fixed list keeps the app's filters and icons consistent. */
export const GYM_FACILITIES = [
  'AC',
  'Showers',
  'Changing rooms',
  'Lockers',
  'Parking',
  'Free weights',
  'Cardio',
  'Classes',
  'Personal training',
  'Sauna',
  'Pool',
  'Women-only hours',
  'Wi-Fi',
  'Juice bar',
] as const;
export type GymFacility = (typeof GYM_FACILITIES)[number];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use a time like 06:00');
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** One day: up to three sessions (e.g. a midday break), in order, not overlapping. Empty = closed. */
const daySchema = z
  .array(z.object({ open: time, close: time }))
  .max(3, 'At most three sessions a day')
  .superRefine((sessions, ctx) => {
    sessions.forEach((s, i) => {
      if (toMinutes(s.close) <= toMinutes(s.open)) ctx.addIssue({ code: 'custom', message: 'Closing time must be after opening time', path: [i] });
      const prev = sessions[i - 1];
      if (prev && toMinutes(s.open) < toMinutes(prev.close)) ctx.addIssue({ code: 'custom', message: 'Sessions overlap', path: [i] });
    });
  });

export const openingHoursSchema = z.object(Object.fromEntries(WEEK_DAYS.map((d) => [d, daySchema])) as Record<WeekDay, typeof daySchema>);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

export const updateGymProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name your gym').max(60),
  description: optionalText(600),
  phone: z.union([ghanaPhoneSchema, z.literal('').transform(() => null), z.null()]),
  email: z.union([z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')), z.literal('').transform(() => null), z.null()]),
  addressText: z.string().trim().min(3, 'Enter the gym’s area or address').max(120),
  facilities: z.array(z.enum(GYM_FACILITIES)).max(GYM_FACILITIES.length),
  openingHours: openingHoursSchema,
});
export type UpdateGymProfileInput = z.input<typeof updateGymProfileSchema>;

export type GymStatus = 'draft' | 'pending_review' | 'active' | 'suspended';

export interface GymProfile {
  id: string;
  slug: string;
  status: GymStatus;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  addressText: string;
  coverUrl: string | null;
  facilities: string[];
  openingHours: OpeningHours;
  updatedAt: string;
}
