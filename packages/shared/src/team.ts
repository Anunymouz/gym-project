import { z } from 'zod';
import { emailSchema } from './schemas.js';
import type { GymStaffRole } from './staff.js';

export const gymStaffRoleSchema = z.enum(['owner', 'manager', 'front_desk']);
export const GYM_ROLE_LABELS: Record<GymStaffRole, string> = { owner: 'Owner', manager: 'Manager', front_desk: 'Front desk' };
export const GYM_ROLE_DESCRIPTIONS: Record<GymStaffRole, string> = {
  owner: 'Everything, including payouts and staff',
  manager: 'Plans, photos, settings and revenue; can invite front desk',
  front_desk: 'Check-ins and members',
};
/** Invitations last a week. */
export const INVITATION_TTL_DAYS = 7;

/** Who may invite (or remove) whom: owners anyone; managers front desk only. */
export function canManageRole(actor: GymStaffRole, target: GymStaffRole): boolean {
  return actor === 'owner' || (actor === 'manager' && target === 'front_desk');
}

export const inviteStaffSchema = z.object({ email: emailSchema, role: gymStaffRoleSchema });
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
export const changeStaffRoleSchema = z.object({ role: gymStaffRoleSchema });

export interface GymTeam {
  members: Array<{ userId: string; name: string | null; email: string; role: GymStaffRole; joinedAt: string; isYou: boolean }>;
  invitations: Array<{ id: string; email: string; role: GymStaffRole; invitedBy: string | null; createdAt: string; expiresAt: string }>;
}

/** An invitation waiting for the signed-in person. */
export interface MyInvitation {
  id: string;
  gymId: string;
  gymName: string;
  gymArea: string;
  role: GymStaffRole;
  invitedBy: string | null;
  expiresAt: string;
}
