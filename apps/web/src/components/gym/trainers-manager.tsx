'use client';

import { useState, useTransition } from 'react';
import { CircleNotch, EnvelopeSimple, UserPlus, X } from '@phosphor-icons/react';
import { formatGhs, pesewas, type GymTrainers } from '@bgym/shared';
import { cancelTrainerInvitation, inviteTrainer, removeTrainer } from '@/app/(dashboards)/trainer-actions';
import { Badge } from '@/components/ui/badge';
import { formatDate, initials } from '@/lib/format';

/** The gym's personal trainers: invite by email, see who's live, remove. */
export function TrainersManager({ initial, canManage }: { initial: GymTrainers; canManage: boolean }) {
  const [data, setData] = useState(initial);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ data?: GymTrainers; error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.data) {
        setData(res.data);
        after?.();
      }
      setMessage(res.error ? { error: res.error } : ok ? { ok } : {});
    });

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => inviteTrainer(email), `Invitation sent to ${email.trim().toLowerCase()}.`, () => setEmail('')); }} className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
          <h2 className="text-lg font-extrabold">Invite a trainer</h2>
          <p className="text-sm text-mute">They sign in with that email, set up their profile, hours and payout account, then members can book and pay them in the app. Their money goes straight to them; BGYM takes a small fee.</p>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-64 flex-1">
              <label htmlFor="trainer-email" className="sr-only">Trainer’s email</label>
              <EnvelopeSimple size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
              <input id="trainer-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@email.com" className="h-11 w-full rounded-control border border-line bg-white pr-3 pl-10 outline-none focus:border-flare" />
            </div>
            <button type="submit" disabled={pending || !email} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">
              {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <UserPlus size={18} weight="bold" aria-hidden />} Send invite
            </button>
          </div>
        </form>
      )}
      {(message.ok || message.error) && <p role={message.error ? 'alert' : 'status'} className={`text-sm font-semibold ${message.error ? 'text-danger' : 'text-success'}`}>{message.error ?? message.ok}</p>}

      {data.invitations.length > 0 && (
        <section aria-labelledby="pending" className="rounded-card border border-line bg-white p-5">
          <h2 id="pending" className="font-bold">Waiting to accept</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><span className="font-semibold">{i.email}</span> <span className="text-mute">· sent {formatDate(i.createdAt)} · expires {formatDate(i.expiresAt)}</span></span>
                {canManage && <button type="button" disabled={pending} onClick={() => run(() => cancelTrainerInvitation(i.id), 'Invitation cancelled.')} className="inline-flex h-9 items-center gap-1 rounded-control px-2.5 font-bold text-mute hover:bg-danger-50 hover:text-danger"><X size={14} aria-hidden /> Cancel</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="list" className="flex flex-col gap-3">
        <h2 id="list" className="font-bold">Your trainers</h2>
        {data.trainers.length === 0 && <p className="rounded-card border border-dashed border-[#C9CDE0] bg-white px-6 py-12 text-center text-mute">No trainers yet. Members love gyms with coaches they can book.</p>}
        {data.trainers.map((t) => (
          <article key={t.id} className={`flex flex-wrap items-center gap-4 rounded-card border border-line bg-white p-4 ${t.status === 'suspended' ? 'opacity-60' : ''}`}>
            <span className="grid size-11 place-items-center rounded-full bg-violet-50 font-bold text-violet">{initials(t.name, t.email)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t.name ?? t.email}</p>
              <p className="text-sm text-mute">{t.specialties.join(' · ') || 'Setting up their profile'}{t.sessionPricePesewas > 0 && ` · ${formatGhs(pesewas(t.sessionPricePesewas))} a session`}</p>
            </div>
            {t.status === 'suspended' ? <Badge tone="danger">Removed</Badge> : t.listed ? <Badge tone="success">Live in the app</Badge> : <Badge tone="warning">Setting up</Badge>}
            <span className="text-sm text-mute tabular-nums">{t.upcomingBookings} upcoming</span>
            {canManage && t.status !== 'suspended' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => { if (confirm(`Remove ${t.name ?? t.email}? They’ll disappear from the app and ${t.upcomingBookings} upcoming session(s) will be cancelled and refunded.`)) run(() => removeTrainer(t.id), 'Trainer removed.'); }}
                className="h-9 rounded-control border-[1.5px] border-line px-3 text-sm font-bold text-danger hover:bg-danger-50"
              >
                Remove
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
