import { z } from 'zod';

export type GymStaffRole = 'owner' | 'manager' | 'front_desk';

export interface StaffGym {
  id: string;
  name: string;
  slug: string;
  addressText: string;
  coverUrl: string | null;
  role: GymStaffRole;
}

export interface GymOverview {
  activeMembers: number;
  newThisMonth: number;
  expiringIn7Days: number;
  /** The gym's share after BGYM's fee, this calendar month (Accra time = UTC). */
  revenueThisMonthPesewas: number;
  checkInsByDay: Array<{ date: string; count: number }>;
  expiringSoon: Array<{ membershipId: string; memberName: string | null; plan: string; endsAt: string }>;
  recentPayments: Array<{ id: string; memberName: string | null; plan: string; channel: string | null; amountPesewas: number; paidAt: string }>;
}

export const memberFilterSchema = z.enum(['all', 'active', 'expiring', 'expired']).default('all');
export const membersQuerySchema = z.object({
  filter: memberFilterSchema,
  q: z.string().trim().max(80).optional(),
});
export type MembersQuery = z.infer<typeof membersQuerySchema>;

export interface GymMember {
  userId: string;
  name: string | null;
  email: string;
  plan: string;
  status: 'active' | 'expiring' | 'expired';
  endsAt: string;
  lastCheckInAt: string | null;
}

export interface StaffPlan {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  pricePesewas: number;
  isActive: boolean;
  activeMembers: number;
}

const planFields = {
  name: z.string().trim().min(2, 'Name the plan').max(40),
  description: z.string().trim().max(160).nullable().optional(),
  durationDays: z.coerce.number().int().min(1, 'At least 1 day').max(366, 'At most a year'),
  /** Price in pesewas. Minimum GH₵ 1, maximum GH₵ 100,000. */
  pricePesewas: z.coerce.number().int().min(100, 'At least GH₵ 1').max(10_000_000, 'That price looks too high'),
};
export const createPlanSchema = z.object(planFields);
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export const updatePlanSchema = z.object({ ...planFields, isActive: z.boolean() }).partial();
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const checkInByEmailSchema = z.object({
  gymId: z.uuid(),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
});
export type CheckInByEmailInput = z.infer<typeof checkInByEmailSchema>;
