'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { CircleNotch, PencilSimple, Percent, X } from '@phosphor-icons/react';
import { formatPercent } from '@bgym/shared';
import { saveGymFee } from '@/app/(dashboards)/admin-actions';

/** Shows the fee this gym pays and lets the BGYM team set a special rate (or go back to the default). */
export function GymFeeEditor({ gymId, gymName, feeBps, defaultBps }: { gymId: string; gymName: string; feeBps: number | null; defaultBps: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [value, setValue] = useState(feeBps === null ? '' : String(feeBps / 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (percent: string) =>
    start(async () => {
      const res = await saveGymFee(gymId, percent);
      setError(res.error ?? null);
      if (!res.error) dialog.current?.close();
    });

  return (
    <>
      <p className="inline-flex items-center gap-1.5">
        <Percent size={18} className="text-mute" aria-hidden />
        BGYM fee: <span className="font-bold">{formatPercent(feeBps ?? defaultBps)}</span>
        <span className="text-mute">{feeBps === null ? '(default)' : '(special rate)'}</span>
        <button type="button" onClick={() => { setValue(feeBps === null ? '' : String(feeBps / 100)); setError(null); dialog.current?.showModal(); }} aria-label={`Change ${gymName}’s fee`} className="grid size-7 place-items-center rounded-full text-mute hover:bg-cloud hover:text-midnight">
          <PencilSimple size={15} aria-hidden />
        </button>
      </p>
      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[min(92vw,420px)] rounded-[22px] p-0 backdrop:bg-night/60">
        <form className="flex flex-col gap-3 p-6" onSubmit={(e) => { e.preventDefault(); save(value); }}>
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-extrabold">{gymName}’s fee</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-cloud"><X size={20} /></button>
          </div>
          <p className="text-sm text-mute">A special rate for this gym only, e.g. a launch deal. Leave it empty to use the default ({formatPercent(defaultBps)}). Applies to new payments.</p>
          <div className="relative w-36">
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(defaultBps / 100)} aria-label="Special rate, percent" autoFocus className="h-12 w-full rounded-control border border-line pr-9 pl-3 text-xl font-extrabold tabular-nums outline-none focus:border-flare" />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-bold text-mute">%</span>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            {feeBps !== null && (
              <button type="button" disabled={pending} onClick={() => save('')} className="h-11 rounded-control border-[1.5px] border-line px-4 text-sm font-bold hover:bg-cloud">Use default</button>
            )}
            <button type="submit" disabled={pending} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-control bg-flare text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">
              {pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
