'use client';

import { useState, useTransition } from 'react';
import { CircleNotch, EnvelopeOpen } from '@phosphor-icons/react';
import { GYM_ROLE_LABELS, type MyInvitation } from '@bgym/shared';
import { respondToInvitation } from '@/app/(dashboards)/actions';

/** Invitations waiting for the signed-in person, shown at the top of the gym dashboard. */
export function PendingInvitations({ invitations, askName }: { invitations: MyInvitation[]; askName: boolean }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const respond = (id: string, accept: boolean) => {
    setBusy(id);
    start(async () => {
      const res = await respondToInvitation(id, accept, askName && accept ? name : undefined);
      setError(res.error ?? null);
      setBusy(null);
    });
  };

  return (
    <div className="mb-6 flex flex-col gap-3">
      {invitations.map((inv) => (
        <section key={inv.id} className="flex flex-wrap items-center gap-4 rounded-card border-2 border-violet/30 bg-violet-50 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-violet"><EnvelopeOpen size={26} weight="duotone" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold">Join {inv.gymName}</h2>
            <p className="text-sm text-midnight/80">{inv.invitedBy ?? 'The gym'} invited you as <span className="font-bold">{GYM_ROLE_LABELS[inv.role]}</span> · {inv.gymArea}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {askName && (
              <>
                <label htmlFor={`name-${inv.id}`} className="sr-only">Your name</label>
                <input id={`name-${inv.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" maxLength={60} className="h-11 w-48 rounded-control border border-line bg-white px-3 outline-none focus:border-flare" />
              </>
            )}
            <button type="button" disabled={busy !== null} onClick={() => respond(inv.id, false)} className="h-11 rounded-control border-[1.5px] border-line bg-white px-4 text-sm font-bold hover:bg-cloud">Decline</button>
            <button type="button" disabled={busy !== null} onClick={() => respond(inv.id, true)} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-70">
              {busy === inv.id && <CircleNotch size={18} className="animate-spin" aria-hidden />} Accept
            </button>
          </div>
        </section>
      ))}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
