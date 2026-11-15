import { z } from 'zod';
import type { GymStatus } from './gym-profile.js';
import { ghanaPhoneSchema } from './schemas.js';

/** Roughly Ghana's bounding box: catches swapped or mistyped coordinates. */
export const ghanaLocationSchema = z.object({
  lat: z.number().min(4.5, 'That location isn’t in Ghana').max(11.2, 'That location isn’t in Ghana'),
  lng: z.number().min(-3.3, 'That location isn’t in Ghana').max(1.3, 'That location isn’t in Ghana'),
});
export type GymLocation = z.infer<typeof ghanaLocationSchema>;

/**
 * Reads coordinates from what people paste: "5.6357, -0.1573", or a Google Maps link
 * (…/@5.6357,-0.1573,17z or ?q=5.6357,-0.1573). Null if none found.
 */
export function parseCoordinates(text: string): GymLocation | null {
  const m = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(text);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

export const applyGymSchema = z.object({
  name: z.string().trim().min(2, 'Name your gym').max(60),
  addressText: z.string().trim().min(3, 'Enter the gym’s area or address').max(120),
  phone: ghanaPhoneSchema,
  location: ghanaLocationSchema,
  description: z.string().trim().max(600).optional(),
});
export type ApplyGymInput = z.input<typeof applyGymSchema>;

export interface GymApplicationResponse {
  id: string;
  slug: string;
}

/** What a gym still needs before it can be sent for review. */
export interface GymReadiness {
  status: GymStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  steps: { profile: boolean; photos: boolean; hours: boolean; plans: boolean; payout: boolean };
  canSubmit: boolean;
}

export const reviewGymSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal('return'), note: z.string().trim().min(5, 'Tell the gym what to fix').max(500) }),
]);
export type ReviewGymInput = z.infer<typeof reviewGymSchema>;

export const suspendGymSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason').max(500) });

export const adminGymsQuerySchema = z.object({
  status: z.enum(['draft', 'pending_review', 'active', 'suspended', 'all']).default('all'),
  q: z.string().trim().max(80).optional(),
});

export interface AdminGym {
  id: string;
  name: string;
  slug: string;
  status: GymStatus;
  addressText: string;
  phone: string | null;
  description: string | null;
  location: GymLocation;
  owner: { name: string | null; email: string } | null;
  plans: Array<{ name: string; durationDays: number; pricePesewas: number; isActive: boolean }>;
  /** Thumbnail URLs, cover first. */
  photos: string[];
  payoutReady: boolean;
  /** BGYM's special rate for this gym in bps, or null when it follows the default. */
  feeBps: number | null;
  activeMembers: number;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}
