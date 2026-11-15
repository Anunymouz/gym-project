'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { ArrowCounterClockwise, CheckCircle, CircleNotch, Pause, Play, X } from '@phosphor-icons/react';
import { reactivateGym, reviewGym, suspendGym, type AdminActionResult } from '@/app/(dashboards)/admin-actions';

type Mode = 'return' | 'suspend';

/** Approve / send back (pending gyms), pause (live) or reactivate (paused). */
export function GymDecision({ gymId, gymName, status, canApprove }: { gymId: string; gymName: string; status: string; canApprove: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const act = (fn: () => Promise<AdminActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res.error ?? null);
      if (!res.error) after?.();
    });
  const open = (m: Mode) => {
    setMode(m);
    setNote('');
    setError(null);
    dialog.current?.showModal();
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {status === 'pending_review' && (
          <>
            <button type="button" onClick={() => open('return')} disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-control border-[1.5px] border-line bg-white px-3.5 text-sm font-bold hover:bg-cloud">
              <ArrowCounterClockwise size={16} weight="bold" aria-hidden /> Send back
            </button>
            <button type="button" onClick={() => act(() => reviewGym(gymId, 'approve'))} disabled={pending || !canApprove} title={canApprove ? undefined : 'Needs a payout account first'} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-success px-3.5 text-sm font-bold text-white hover:bg-[#13893f] disabled:opacity-50">
              {pending ? <CircleNotch size={16} className="animate-spin" aria-hidden /> : <CheckCircle size={16} weight="bold" aria-hidden />} Approve
            </button>
          </>
        )}
        {status === 'active' && (
          <button type="button" onClick={() => open('suspend')} disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-control border-[1.5px] border-line bg-white px-3.5 text-sm font-bold text-danger hover:bg-danger-50">
            <Pause size={16} weight="bold" aria-hidden /> Pause
          </button>
        )}
        {status === 'suspended' && (
          <button type="button" onClick={() => act(() => reactivateGym(gymId))} disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-midnight px-3.5 text-sm font-bold text-white hover:bg-indigo">
            {pending ? <CircleNotch size={16} className="animate-spin" aria-hidden /> : <Play size={16} weight="bold" aria-hidden />} Reactivate
          </button>
        )}
      </div>
      {error && !mode && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}

      <dialog ref={dialog} aria-labelledby={titleId} onClose={() => setMode(null)} className="m-auto w-[min(92vw,460px)] rounded-[22px] p-0 backdrop:bg-night/60">
        <form
          className="flex flex-col gap-3 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => (mode === 'suspend' ? suspendGym(gymId, note) : reviewGym(gymId, 'return', note)), () => dialog.current?.close());
          }}
        >
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-extrabold">{mode === 'suspend' ? `Pause ${gymName}?` : `Send ${gymName} back`}</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-cloud"><X size={20} /></button>
          </div>
          <p className="text-sm text-mute">
            {mode === 'suspend'
              ? 'The gym disappears from the app and can’t sell memberships. Members who already paid can still check in. The owner is emailed this reason.'
              : 'The gym goes back to draft. The owner sees this note in their dashboard and by email.'}
          </p>
          <label htmlFor={`${titleId}-note`} className="text-sm font-bold">{mode === 'suspend' ? 'Reason' : 'What needs to change'}</label>
          <textarea id={`${titleId}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={500} required autoFocus className="w-full rounded-control border border-line px-3 py-2 outline-none focus:border-flare" />
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={pending || note.trim().length < 5} className={`inline-flex h-12 items-center justify-center gap-2 rounded-control font-bold text-white disabled:opacity-50 ${mode === 'suspend' ? 'bg-danger' : 'bg-midnight hover:bg-indigo'}`}>
            {pending && <CircleNotch size={18} className="animate-spin" aria-hidden />}
            {mode === 'suspend' ? 'Pause gym' : 'Send back to owner'}
          </button>
        </form>
      </dialog>
    </div>
  );
}
