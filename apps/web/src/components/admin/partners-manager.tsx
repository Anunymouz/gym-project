'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, Storefront } from '@phosphor-icons/react';
import { formatPercent, type SellerAccount } from '@bgym/shared';
import { createPartner, updatePartner } from '@/app/(dashboards)/store-actions';
import { Badge } from '@/components/ui/badge';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';

/** Store partners: set one up (they get an email to sign in), change commission, pause. */
export function PartnersManager({ initial }: { initial: SellerAccount[] }) {
  const [sellers, setSellers] = useState(initial);
  const [form, setForm] = useState({ name: '', contactEmail: '', contactPhone: '', commission: '15' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const replace = (s: SellerAccount) => setSellers((l) => (l.some((x) => x.id === s.id) ? l.map((x) => (x.id === s.id ? s : x)) : [...l, s]));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createPartner({ name: form.name, contactEmail: form.contactEmail, contactPhone: form.contactPhone, commissionBps: Math.round(Number(form.commission) * 100) });
            setErrors(res.fieldErrors ?? {});
            if (res.data) {
              replace(res.data);
              setMessage({ ok: `${res.data.name} is set up. We’ve emailed ${form.contactEmail} to sign in.` });
              setForm({ name: '', contactEmail: '', contactPhone: '', commission: '15' });
            } else setMessage({ error: res.error ?? 'Check the highlighted fields.' });
          });
        }}
        className="flex flex-col gap-3 self-start rounded-card border border-line bg-white p-5"
      >
        <h2 className="text-lg font-extrabold">Add a store partner</h2>
        <p className="text-sm text-mute">A supplier who lists their own products. The person at this email runs their dashboard.</p>
        <input aria-label="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} placeholder="Business name" className={field} />
        <input aria-label="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} aria-invalid={!!errors.contactEmail} placeholder="Contact email" className={field} />
        <input aria-label="Contact phone" inputMode="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} aria-invalid={!!errors.contactPhone} placeholder="Phone, e.g. 024 123 4567" className={field} />
        <div className="flex items-center gap-2">
          <label htmlFor="commission" className="text-sm font-bold">BGYM commission</label>
          <input id="commission" inputMode="decimal" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value.replace(/[^\d.]/g, '') })} aria-invalid={!!errors.commissionBps} className="h-11 w-20 rounded-control border border-line px-3 text-right outline-none focus:border-flare" />
          <span className="text-mute">% of each sale</span>
        </div>
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 self-start rounded-control bg-flare px-5 text-sm font-bold text-white disabled:opacity-60">{pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} Add partner</button>
        {message.ok && <p role="status" className="inline-flex items-start gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> {message.ok}</p>}
        {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
      </form>

      <section aria-labelledby="sellers" className="flex flex-col gap-3">
        <h2 id="sellers" className="font-bold">Sellers</h2>
        {sellers.map((s) => <SellerRow key={s.id} seller={s} onChange={replace} />)}
      </section>
    </div>
  );
}

function SellerRow({ seller: s, onChange }: { seller: SellerAccount; onChange: (s: SellerAccount) => void }) {
  const [commission, setCommission] = useState(String(s.commissionBps / 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (input: { commissionBps?: number; isActive?: boolean }) => start(async () => { const res = await updatePartner(s.id, input); if (res.data) onChange(res.data); setError(res.error ?? null); });
  return (
    <article className={`flex flex-wrap items-center gap-4 rounded-card border border-line bg-white p-4 ${s.isActive ? '' : 'opacity-60'}`}>
      <span className="grid size-11 place-items-center rounded-2xl bg-violet-50 text-violet"><Storefront size={22} weight="duotone" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{s.name} {s.type === 'platform' && <Badge tone="info">BGYM</Badge>} {!s.isActive && <Badge tone="danger">Paused</Badge>}</p>
        <p className="text-sm text-mute">{s.products.active} live · {s.products.pending} waiting{s.type === 'partner' ? ` · ${s.payoutConnected ? 'payout set' : 'no payout account'} · ${s.pickup ? 'pickup set' : 'no pickup point'}` : ''}</p>
      </div>
      {s.type === 'partner' && (
        <>
          <form onSubmit={(e) => { e.preventDefault(); run({ commissionBps: Math.round(Number(commission) * 100) }); }} className="flex items-center gap-1">
            <label htmlFor={`c-${s.id}`} className="sr-only">Commission for {s.name}</label>
            <input id={`c-${s.id}`} inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} className="h-9 w-16 rounded-control border border-line px-2 text-right tabular-nums" />
            <span className="text-mute">%</span>
            <button type="submit" disabled={pending} className="h-9 rounded-control px-2 text-sm font-bold text-flare hover:bg-flare-50" title={`Now ${formatPercent(s.commissionBps)}`}>Set</button>
          </form>
          <button type="button" disabled={pending} onClick={() => { if (!s.isActive || confirm(`Pause ${s.name}? Their products disappear from the store; open orders carry on.`)) run({ isActive: !s.isActive }); }} className="h-9 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud">{s.isActive ? 'Pause' : 'Restore'}</button>
        </>
      )}
      {error && <p role="alert" className="w-full text-sm font-semibold text-danger">{error}</p>}
    </article>
  );
}
