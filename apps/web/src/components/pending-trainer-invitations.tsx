'use client';

import { useState, useTransition } from 'react';
import { Barbell, CircleNotch } from '@phosphor-icons/react';
import type { MyTrainerInvitation } from '@bgym/shared';
import { respondToTrainerInvitation } from '@/app/(dashboards)/trainer-actions';

/** "Coach at <gym>" invitations, shown where invited people land after signing in. */
export function PendingTrainerInvitations({ invitations }: { invitations: MyTrainerInvitation[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const respond = (id: string, accept: boolean) => {
    setBusy(id);
    start(async () => {
      const res = await respondToTrainerInvitation(id, accept);
      setError(res?.error ?? null);
      setBusy(null);
    });
  };
  return (
    <div className="mb-6 flex flex-col gap-3">
      {invitations.map((inv) => (
        <section key={inv.id} className="flex flex-wrap items-center gap-4 rounded-card border-2 border-flare/30 bg-flare-50 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-flare"><Barbell size={26} weight="duotone" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold">Coach at {inv.gym.name}</h2>
            <p className="text-sm text-midnight/80">{inv.invitedBy ?? 'The gym'} invited you to join as a personal trainer. Members will book and pay you in the BGYM app.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy !== null} onClick={() => respond(inv.id, false)} className="h-11 rounded-control border-[1.5px] border-line bg-white px-4 text-sm font-bold hover:bg-cloud">Decline</button>
            <button type="button" disabled={busy !== null} onClick={() => respond(inv.id, true)} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-70">
              {busy === inv.id && <CircleNotch size={18} className="animate-spin" aria-hidden />} Accept and set up
            </button>
          </div>
        </section>
      ))}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
