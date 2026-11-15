'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, Package, Phone, Prohibit, UserMinus, Wallet } from '@phosphor-icons/react';
import type { TrainerBooking } from '@bgym/shared';
import { actOnBooking } from '@/app/(dashboards)/trainer-actions';
import { Badge } from '@/components/ui/badge';

const TZ = 'Africa/Accra';
const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso));

const STATUS: Record<TrainerBooking['status'], { label: string; tone: 'success' | 'info' | 'warning' | 'danger' }> = {
  pending: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  no_show: { label: 'No-show', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** A session in the trainer's list, with the actions that make sense for it. */
export function BookingRow({ booking: initial, showDay, now }: { booking: TrainerBooking; showDay?: boolean; now: number }) {
  const [b, setB] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = Date.parse(b.startsAt) <= now;
  const act = (action: 'complete' | 'no_show' | 'cancel') => {
    if (action === 'cancel' && !confirm(`Cancel ${b.client.name}’s session? They’ll get a full refund${b.paidWith === 'package' ? ' (the session goes back on their package)' : ''} and an email.`)) return;
    start(async () => {
      const res = await actOnBooking(b.id, action);
      if (res.data) setB(res.data);
      setError(res.error ?? null);
    });
  };
  const status = b.status === 'cancelled' && b.cancelledBy ? { ...STATUS.cancelled, label: `Cancelled by ${b.cancelledBy === 'member' ? 'client' : b.cancelledBy === 'trainer' ? 'you' : 'BGYM'}` } : STATUS[b.status];

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-white p-4">
      <div className="w-24 shrink-0">
        {showDay && <p className="text-xs font-bold text-mute uppercase">{day(b.startsAt)}</p>}
        <p className="text-lg font-extrabold tabular-nums">{time(b.startsAt)}</p>
        <p className="text-xs text-mute">to {time(b.endsAt)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{b.client.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute">
          {b.client.phone && <a href={`tel:${b.client.phone}`} className="inline-flex items-center gap-1 hover:text-flare"><Phone size={14} aria-hidden /> {b.client.phone}</a>}
          <span className="inline-flex items-center gap-1">{b.paidWith === 'package' ? <Package size={14} aria-hidden /> : <Wallet size={14} aria-hidden />} {b.paidWith === 'package' ? 'From a package' : 'Paid'}</span>
        </p>
        {b.note && <p className="mt-1 rounded-control bg-cloud px-2.5 py-1.5 text-sm">“{b.note}”</p>}
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
      {b.status === 'confirmed' && (
        <div className="flex flex-wrap gap-2">
          {started ? (
            <>
              <button type="button" disabled={pending} onClick={() => act('complete')} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-success px-3 text-sm font-bold text-white disabled:opacity-60"><CheckCircle size={16} weight="bold" aria-hidden /> Completed</button>
              <button type="button" disabled={pending} onClick={() => act('no_show')} className="inline-flex h-10 items-center gap-1.5 rounded-control border-[1.5px] border-line bg-white px-3 text-sm font-bold hover:bg-cloud disabled:opacity-60"><UserMinus size={16} aria-hidden /> No-show</button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => act('cancel')} className="inline-flex h-10 items-center gap-1.5 rounded-control border-[1.5px] border-line bg-white px-3 text-sm font-bold text-danger hover:bg-danger-50 disabled:opacity-60">
              {pending ? <CircleNotch size={16} className="animate-spin" aria-hidden /> : <Prohibit size={16} aria-hidden />} Cancel
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="w-full text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}
