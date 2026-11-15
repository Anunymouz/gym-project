'use client';

import { useState, useTransition } from 'react';
import { CircleNotch, Package, Plus } from '@phosphor-icons/react';
import { formatGhs, pesewas, type TrainerPackageItem } from '@bgym/shared';
import { createTrainerPackage, setPackageActive } from '@/app/(dashboards)/trainer-actions';
import { Badge } from '@/components/ui/badge';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';
const ghs = (p: number) => formatGhs(pesewas(p));

/** Coaching packages: N sessions within a period, at a fixed price. */
export function PackagesManager({ initial, sessionPricePesewas }: { initial: TrainerPackageItem[]; sessionPricePesewas: number }) {
  const [packages, setPackages] = useState(initial);
  const [form, setForm] = useState({ name: '', description: '', sessionsCount: '8', validityDays: '30', price: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sessions = Number(form.sessionsCount) || 0;
  const price = Math.round(Number(form.price) * 100) || 0;
  const saving = sessionPricePesewas > 0 && sessions > 0 && price > 0 ? Math.round((1 - price / (sessions * sessionPricePesewas)) * 100) : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createTrainerPackage({ name: form.name, description: form.description || undefined, sessionsCount: sessions, validityDays: Number(form.validityDays), pricePesewas: price });
            setErrors(res.fieldErrors ?? {});
            setError(res.error ?? null);
            if (res.data) {
              setPackages(res.data);
              setForm({ name: '', description: '', sessionsCount: '8', validityDays: '30', price: '' });
            }
          });
        }}
        className="flex flex-col gap-4 self-start rounded-card border border-line bg-white p-5"
      >
        <div>
          <h2 className="text-lg font-extrabold">New package</h2>
          <p className="text-sm text-mute">Clients pay once and book the sessions whenever suits them, before it ends.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pkg-name" className="text-sm font-bold">Name</label>
          <input id="pkg-name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="8 sessions a month" aria-invalid={!!errors.name} className={field} />
          {errors.name && <p className="text-sm font-semibold text-danger">{errors.name}</p>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pkg-sessions" className="text-sm font-bold">Sessions</label>
            <input id="pkg-sessions" inputMode="numeric" value={form.sessionsCount} onChange={(e) => setForm({ ...form, sessionsCount: e.target.value.replace(/\D/g, '') })} aria-invalid={!!errors.sessionsCount} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pkg-days" className="text-sm font-bold">Valid for</label>
            <select id="pkg-days" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} className={field}>
              {[14, 21, 30, 42, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pkg-price" className="text-sm font-bold">Price (GH₵)</label>
            <input id="pkg-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })} aria-invalid={!!errors.pricePesewas} className={field} />
          </div>
        </div>
        {(errors.sessionsCount || errors.pricePesewas) && <p className="text-sm font-semibold text-danger">{errors.sessionsCount ?? errors.pricePesewas}</p>}
        {saving !== null && saving > 0 && <p className="text-sm text-success">Clients save {saving}% compared with single sessions.</p>}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pkg-desc" className="text-sm font-bold">Details <span className="font-normal text-mute">(optional)</span></label>
          <input id="pkg-desc" value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Two sessions a week with a written plan" className={field} />
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 self-start rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">
          {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <Plus size={18} weight="bold" aria-hidden />} Create package
        </button>
        <p className="text-xs text-mute">To protect clients who’ve bought it, a package can’t be edited. Turn it off and create a new one instead.</p>
      </form>

      <section aria-labelledby="pkgs" className="flex flex-col gap-3">
        <h2 id="pkgs" className="font-bold">Your packages</h2>
        {packages.length === 0 && <p className="rounded-card border border-dashed border-[#C9CDE0] bg-white px-6 py-12 text-center text-mute">No packages yet. Packages help clients commit, and give you steadier income.</p>}
        {packages.map((p) => (
          <article key={p.id} className={`flex flex-wrap items-center gap-4 rounded-card border border-line bg-white p-5 ${p.isActive ? '' : 'opacity-60'}`}>
            <span className="grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet"><Package size={24} weight="duotone" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{p.name} {!p.isActive && <Badge tone="danger">Off</Badge>}</p>
              <p className="text-sm text-mute">{p.sessionsCount} sessions · {p.validityDays} days · {ghs(Math.round(p.pricePesewas / p.sessionsCount))} a session</p>
              {p.description && <p className="text-sm">{p.description}</p>}
            </div>
            <p className="text-xl font-extrabold tabular-nums">{ghs(p.pricePesewas)}</p>
            <button type="button" disabled={pending} onClick={() => start(async () => { const res = await setPackageActive(p.id, !p.isActive); if (res.data) setPackages(res.data); setError(res.error ?? null); })} className="h-10 rounded-control border-[1.5px] border-line bg-white px-3 text-sm font-bold hover:bg-cloud">
              {p.isActive ? 'Turn off' : 'Turn on'}
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
