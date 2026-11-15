'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { CircleNotch, PencilSimple, Plus, X } from '@phosphor-icons/react';
import type { StaffPlan } from '@bgym/shared';
import { savePlan, type PlanFormState } from '@/app/(dashboards)/gym-actions';

const presets = [
  { label: 'Day', days: 1 }, { label: 'Week', days: 7 }, { label: 'Month', days: 30 }, { label: '3 months', days: 90 }, { label: 'Year', days: 365 },
];

/** Create or edit a plan in a native <dialog> (focus trap, Escape and backdrop for free). */
export function PlanEditor({ mode, plan }: { mode: 'create' | 'edit'; plan?: StaffPlan }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const [state, action, pending] = useActionState(savePlan, {} as PlanFormState);

  useEffect(() => {
    if (state.ok) {
      dialog.current?.close();
      if (mode === 'create') form.current?.reset();
    }
  }, [state, mode]);

  const err = state.fieldErrors ?? {};
  const v = state.ok ? undefined : state.values;
  const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';

  return (
    <>
      {mode === 'create' ? (
        <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14]">
          <Plus size={20} weight="bold" aria-hidden /> New plan
        </button>
      ) : (
        <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-midnight px-3.5 text-sm font-bold text-white hover:bg-indigo">
          <PencilSimple size={16} weight="bold" aria-hidden /> Edit
        </button>
      )}

      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[min(92vw,440px)] rounded-[22px] p-0 backdrop:bg-night/60">
        <form ref={form} action={action} className="flex flex-col gap-4 p-6" noValidate>
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-extrabold">{mode === 'create' ? 'New plan' : `Edit ${plan?.name}`}</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-cloud"><X size={20} /></button>
          </div>
          {plan && <input type="hidden" name="planId" value={plan.id} />}

          <Field label="Name" error={err.name} id={`${titleId}-name`}>
            <input id={`${titleId}-name`} name="name" defaultValue={v?.name ?? plan?.name} maxLength={40} required placeholder="e.g. Monthly" aria-invalid={!!err.name} className={field} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (GH₵)" error={err.price} id={`${titleId}-price`}>
              <input id={`${titleId}-price`} name="price" inputMode="decimal" defaultValue={v?.price ?? (plan ? (plan.pricePesewas / 100).toFixed(2) : '')} required placeholder="350.00" aria-invalid={!!err.price} className={`${field} tabular-nums`} />
            </Field>
            <Field label="Length (days)" error={err.durationDays} id={`${titleId}-days`}>
              <input id={`${titleId}-days`} name="durationDays" type="number" min={1} max={366} defaultValue={v?.durationDays ?? plan?.durationDays ?? 30} required aria-invalid={!!err.durationDays} className={`${field} tabular-nums`} />
            </Field>
          </div>
          <div className="-mt-2 flex flex-wrap gap-1.5" aria-label="Quick lengths">
            {presets.map((p) => (
              <button key={p.days} type="button" className="rounded-full bg-cloud px-2.5 py-1 text-xs font-bold text-mute hover:text-midnight"
                onClick={() => { const input = form.current?.elements.namedItem('durationDays'); if (input instanceof HTMLInputElement) input.value = String(p.days); }}>
                {p.label}
              </button>
            ))}
          </div>

          <Field label="Description (optional)" error={err.description} id={`${titleId}-desc`}>
            <textarea id={`${titleId}-desc`} name="description" defaultValue={v?.description ?? plan?.description ?? ''} maxLength={160} rows={2} placeholder="What's included" className="w-full rounded-control border border-line bg-white px-3 py-2 outline-none focus:border-flare" />
          </Field>

          {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}

          <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-flare font-bold text-white hover:bg-[#f04e14] disabled:opacity-70">
            {pending && <CircleNotch size={20} className="animate-spin" aria-hidden />}
            {mode === 'create' ? 'Add plan' : 'Save changes'}
          </button>
        </form>
      </dialog>
    </>
  );
}

function Field({ label, error, id, children }: { label: string; error?: string | undefined; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      {children}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
