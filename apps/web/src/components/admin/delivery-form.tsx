'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { formatGhs, pesewas, type DeliverySettings } from '@bgym/shared';
import { saveDeliverySettings } from '@/app/(dashboards)/store-actions';

/** Delivery pricing: base fee + per km, up to a maximum distance, with a worked example. */
export function DeliveryForm({ initial }: { initial: DeliverySettings }) {
  const [base, setBase] = useState(String(initial.baseFeePesewas / 100));
  const [perKm, setPerKm] = useState(String(initial.perKmPesewas / 100));
  const [maxKm, setMaxKm] = useState(String(initial.maxKm));
  const [message, setMessage] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const fee = (km: number) => formatGhs(pesewas(Math.round(Number(base) * 100) + km * Math.round(Number(perKm) * 100)));
  const input = 'h-11 w-28 rounded-control border border-line px-3 text-right tabular-nums outline-none focus:border-flare';
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const res = await saveDeliverySettings({ baseFeePesewas: Math.round(Number(base) * 100), perKmPesewas: Math.round(Number(perKm) * 100), maxKm: Number(maxKm) }); setMessage(res.error ? { error: res.error } : { ok: true }); }); }} className="flex flex-col gap-4 rounded-card border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-extrabold">Delivery fees</h2>
        <p className="text-sm text-mute">Charged to members at checkout, per seller (each seller ships from their own pickup point). The fee goes to BGYM, which pays the riders.</p>
      </div>
      <div className="flex flex-wrap gap-5">
        <label className="flex flex-col gap-1 text-sm font-bold">Base fee (GH₵)<input inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">Per km (GH₵)<input inputMode="decimal" value={perKm} onChange={(e) => setPerKm(e.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm font-bold">Furthest (km)<input inputMode="numeric" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} className={input} /></label>
      </div>
      <p className="text-sm text-mute">Examples: 3 km → <span className="font-bold text-midnight">{fee(3)}</span> · 10 km → <span className="font-bold text-midnight">{fee(10)}</span> · 25 km → <span className="font-bold text-midnight">{fee(25)}</span>. Distance is estimated from the map (straight line × 1.3).</p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white disabled:opacity-60">{pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} Save delivery fees</button>
        {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> Saved</p>}
        {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
      </div>
    </form>
  );
}
