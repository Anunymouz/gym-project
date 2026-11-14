import { z } from 'zod';

export const gymSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Unknown gym').max(80);

export interface OpeningHours {
  /** mon…sun → list of { open: "HH:mm", close: "HH:mm" } in Africa/Accra (UTC+0). Empty = closed. */
  [day: string]: Array<{ open: string; close: string }>;
}

export interface MembershipPlanSummary {
  id: string;
  name: string;
  description: string | null;
  durationDays: number;
  pricePesewas: number;
}

export interface GymDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  addressText: string;
  phone: string | null;
  coverUrl: string | null;
  photos: string[];
  facilities: string[];
  openingHours: OpeningHours;
  location: { lat: number; lng: number };
  plans: MembershipPlanSummary[];
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Today's hours and whether the gym is open now (Ghana is UTC+0 all year, no daylight saving). */
export function openingStatus(hours: OpeningHours, now = new Date()): { isOpen: boolean; label: string } {
  const today = hours[DAYS[now.getUTCDay()]!] ?? [];
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const fmt = (t: string) => {
    const h = Number(t.slice(0, 2));
    const m = t.slice(3, 5);
    return `${h % 12 || 12}${m === '00' ? '' : `:${m}`}${h < 12 ? 'am' : 'pm'}`;
  };
  const current = today.find((r) => minutes >= toMin(r.open) && minutes < toMin(r.close));
  if (current) return { isOpen: true, label: `Open until ${fmt(current.close)}` };
  const later = today.find((r) => minutes < toMin(r.open));
  if (later) return { isOpen: false, label: `Opens at ${fmt(later.open)}` };
  return { isOpen: false, label: 'Closed now' };
}

/** "30 days" → "Monthly", etc. */
export function planPeriodLabel(days: number): string {
  if (days === 1) return '1 day';
  if (days === 7) return '1 week';
  if (days === 30) return '30 days';
  if (days === 90) return '3 months';
  if (days === 365) return '1 year';
  return `${days} days`;
}
