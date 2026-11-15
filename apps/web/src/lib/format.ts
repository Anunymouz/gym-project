const TZ = 'Africa/Accra';

export const formatDate = (iso: string) => new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(iso));
export const formatDateTime = (iso: string) => new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
export const weekday = (isoDate: string) => new Intl.DateTimeFormat('en-GH', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));

/** Whole days from now until `iso` (0 = later today). */
export function daysUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

export function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  return source.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

const channels: Record<string, string> = { mobile_money: 'Mobile money', card: 'Card', bank: 'Bank', ussd: 'USSD', bank_transfer: 'Bank transfer', dev: 'Test payment' };
export const channelLabel = (c: string | null) => (c ? channels[c] ?? c : '—');

export function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The time this server render started (server components render once per request). */
export const requestTime = () => Date.now();

const REMIND_COOLDOWN_MS = 24 * 3_600_000;

/** "Reminded 3h ago" if the member was reminded within the last day, else null (can remind). */
export function remindedLabel(lastRemindedAt: string | null, now: number): string | null {
  if (!lastRemindedAt) return null;
  const ago = now - Date.parse(lastRemindedAt);
  if (ago >= REMIND_COOLDOWN_MS) return null;
  const minutes = Math.max(1, Math.round(ago / 60_000));
  return minutes < 60 ? `Reminded ${minutes}m ago` : `Reminded ${Math.round(minutes / 60)}h ago`;
}
