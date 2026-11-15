'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { feeFor, formatGhs, formatPercent, pesewas, percentToBps } from '@bgym/shared';
import { saveDefaultFee } from '@/app/(dashboards)/admin-actions';

const COPY = {
  membership: {
    example: 35_000, // a GH₵350 monthly membership
    title: 'BGYM’s fee on memberships',
    help: 'Taken from every membership payment in the app, for every gym without a special rate. Applies to new payments straight away; past payments keep the fee they were charged.',
    who: 'every gym without a special rate',
    exampleText: 'a member buys a GH₵350 monthly membership.',
    receiver: 'Gym receives',
    receiverNote: 'Paid into the gym’s own payout account, minus Paystack’s processing fee',
  },
  trainer: {
    example: 12_000, // a GH₵120 session
    title: 'BGYM’s fee on trainer sessions and packages',
    help: 'Taken from every trainer session and package payment, for every trainer without a special rate. Applies to new payments straight away.',
    who: 'every trainer without a special rate',
    exampleText: 'a member books a GH₵120 session.',
    receiver: 'Trainer receives',
    receiverNote: 'Paid into the trainer’s own payout account, minus Paystack’s processing fee',
  },
} as const;

/** Sets one of BGYM's default fees, with a worked example and a confirm step (it affects everyone). */
export function FeeForm({ currentBps, kind = 'membership' }: { currentBps: number; kind?: 'membership' | 'trainer' }) {
  const copy = COPY[kind];
  const EXAMPLE = copy.example;
  const [value, setValue] = useState(String(currentBps / 100));
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = /^\d{1,2}(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 30;
  const bps = valid ? percentToBps(Number(value)) : null;
  const changed = bps !== null && bps !== currentBps;
  const fee = bps === null ? 0 : feeFor(EXAMPLE, bps);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed) return;
          if (!confirming) return setConfirming(true);
          start(async () => {
            const res = await saveDefaultFee(value, kind);
            setError(res.error ?? null);
            setConfirming(false);
            setSaved(!res.error);
          });
        }}
        className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
      >
        <label htmlFor={`fee-${kind}`} className="font-bold">{copy.title}</label>
        <p className="text-sm text-mute">{copy.help}</p>
        <div className="relative w-40">
          <input
            id={`fee-${kind}`}
            inputMode="decimal"
            value={value}
            onChange={(e) => { setValue(e.target.value); setConfirming(false); setSaved(false); setError(null); }}
            aria-invalid={!valid}
            className="h-14 w-full rounded-control border border-line bg-white pr-10 pl-4 text-2xl font-extrabold tabular-nums outline-none focus:border-flare aria-[invalid=true]:border-danger"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xl font-bold text-mute">%</span>
        </div>
        {!valid && <p className="text-sm font-semibold text-danger">Enter a percentage from 0 to 30, like 2 or 2.5.</p>}
        {confirming && bps !== null && (
          <p role="alert" className="rounded-control bg-flare-50 p-3 text-sm">
            Change BGYM’s fee from <span className="font-bold">{formatPercent(currentBps)}</span> to <span className="font-bold">{formatPercent(bps)}</span> for {copy.who}? Press the button again to confirm.
          </p>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        {saved && !changed && (
          <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> Saved. New payments use {formatPercent(currentBps)}.</p>
        )}
        <button type="submit" disabled={!changed || pending} className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-50">
          {pending && <CircleNotch size={18} className="animate-spin" aria-hidden />}
          {confirming ? `Confirm ${bps !== null ? formatPercent(bps) : ''}` : 'Save fee'}
        </button>
      </form>

      <section aria-labelledby={`example-${kind}`} className="rounded-card bg-midnight p-5 text-white">
        <h2 id={`example-${kind}`} className="font-bold">How a payment is split</h2>
        <p className="text-sm text-white/70">Example: {copy.exampleText}</p>
        <dl className="mt-4 flex flex-col gap-2.5">
          <Row label="Member pays" value={formatGhs(pesewas(EXAMPLE))} />
          <Row label={`BGYM’s fee (${bps !== null ? formatPercent(bps) : '—'})`} value={formatGhs(pesewas(fee))} note="Paid into BGYM’s Paystack account" accent />
          <Row label={copy.receiver} value={formatGhs(pesewas(EXAMPLE - fee))} note={copy.receiverNote} />
        </dl>
        <p className="mt-4 text-xs text-white/60">Paystack splits each payment automatically: BGYM’s share goes to BGYM, the rest to the {kind === 'trainer' ? 'trainer' : 'gym'}. Paystack’s own fee comes out of their share.</p>
      </section>
    </div>
  );
}

function Row({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2.5 last:border-0">
      <div>
        <dt className={accent ? 'font-bold text-ember' : 'font-semibold'}>{label}</dt>
        {note && <dd className="text-xs text-white/60">{note}</dd>}
      </div>
      <dd className={`text-lg font-extrabold tabular-nums ${accent ? 'text-ember' : ''}`}>{value}</dd>
    </div>
  );
}
