'use client';

import { useState, useTransition } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import type { SellerProduct } from '@bgym/shared';
import { setStock } from '@/app/(dashboards)/store-actions';

/** Every option's stock in one table, with quick edits. Low stock (under 5) stands out. */
export function StockTable({ scope, products }: { scope: 'partner' | 'own'; products: SellerProduct[] }) {
  const rows = products.filter((p) => p.status !== 'archived').flatMap((p) => p.variants.filter((v) => v.isActive).map((v) => ({ product: p.title, ...v })));
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs text-mute uppercase">
          <tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Option</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Held for payments</th><th className="px-5 py-3">In stock</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-mute">No products yet.</td></tr>}
          {rows.map((r) => <StockRow key={r.id} scope={scope} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function StockRow({ scope, row }: { scope: 'partner' | 'own'; row: { id: string; product: string; name: string; sku: string; stock: number; reserved: number } }) {
  const [value, setValue] = useState(String(row.stock));
  const [saved, setSaved] = useState(row.stock);
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();
  const low = saved - row.reserved < 5;
  const save = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n === saved) return;
    start(async () => {
      const res = await setStock(scope, row.id, n);
      if (res.data) setSaved(n);
      setState(res.error ? { error: res.error } : { ok: true });
    });
  };
  return (
    <tr className={low ? 'bg-flare-50/50' : undefined}>
      <td className="px-5 py-2.5 font-semibold">{row.product}</td>
      <td className="px-5 py-2.5">{row.name}</td>
      <td className="px-5 py-2.5 font-mono text-xs">{row.sku}</td>
      <td className="px-5 py-2.5 tabular-nums">{row.reserved}</td>
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          <label htmlFor={`st-${row.id}`} className="sr-only">Stock for {row.product} {row.name}</label>
          <input id={`st-${row.id}`} inputMode="numeric" value={value} disabled={pending} onChange={(e) => { setValue(e.target.value.replace(/\D/g, '')); setState({}); }} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} className={`h-9 w-24 rounded-control border px-2 tabular-nums outline-none focus:border-flare ${low ? 'border-flare' : 'border-line'}`} />
          {state.ok && <CheckCircle size={18} weight="fill" className="text-success" aria-label="Saved" />}
          {low && !state.error && <span className="text-xs font-bold text-flare">Low</span>}
        </div>
        {state.error && <p role="alert" className="mt-1 text-xs font-semibold text-danger">{state.error}</p>}
      </td>
    </tr>
  );
}
