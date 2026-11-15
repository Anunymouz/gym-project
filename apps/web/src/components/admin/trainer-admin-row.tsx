'use client';

import { useState, useTransition } from 'react';
import { formatGhs, formatPercent, pesewas, type AdminTrainer } from '@bgym/shared';
import { adminTrainerAction, setTrainerFee } from '@/app/(dashboards)/trainer-actions';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';

/** One trainer for the BGYM team: pause/restore, special fee. */
export function TrainerAdminRow({ trainer: t, defaultBps }: { trainer: AdminTrainer; defaultBps: number }) {
  const [fee, setFee] = useState(t.feeBps === null ? '' : String(t.feeBps / 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>) => start(async () => setError((await fn()).error ?? null));
  return (
    <tr>
      <td className="px-5 py-3"><p className="font-bold">{t.name ?? t.email}</p><p className="text-mute">{t.email}</p></td>
      <td className="px-5 py-3">{t.gym}</td>
      <td className="px-5 py-3">{t.status === 'suspended' ? <Badge tone="danger">Paused</Badge> : t.listed ? <Badge tone="success">Live</Badge> : <Badge tone="warning">Setting up</Badge>}</td>
      <td className="px-5 py-3 tabular-nums">{t.sessionPricePesewas ? formatGhs(pesewas(t.sessionPricePesewas)) : '—'}</td>
      <td className="px-5 py-3 tabular-nums">{t.bookings}</td>
      <td className="px-5 py-3">
        <form onSubmit={(e) => { e.preventDefault(); act(() => setTrainerFee(t.id, fee.trim() === '' ? null : Number(fee))); }} className="flex items-center gap-1.5">
          <label htmlFor={`fee-${t.id}`} className="sr-only">Special fee for {t.name}</label>
          <input id={`fee-${t.id}`} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder={formatPercent(defaultBps)} className="h-9 w-20 rounded-control border border-line px-2 text-right tabular-nums outline-none focus:border-flare" />
          <span className="text-mute">%</span>
          <button type="submit" disabled={pending} className="h-9 rounded-control px-2 text-sm font-bold text-flare hover:bg-flare-50">Set</button>
        </form>
      </td>
      <td className="px-5 py-3 text-right whitespace-nowrap">
        {t.status === 'suspended' ? (
          <button type="button" disabled={pending} onClick={() => act(() => adminTrainerAction(t.id, 'reactivate'))} className="h-9 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud">Restore</button>
        ) : (
          <button type="button" disabled={pending} onClick={() => { if (confirm(`Pause ${t.name ?? t.email}? They disappear from the app and their upcoming sessions are cancelled and refunded.`)) act(() => adminTrainerAction(t.id, 'suspend')); }} className="h-9 rounded-control border-[1.5px] border-line px-3 text-sm font-bold text-danger hover:bg-danger-50">Pause</button>
        )}
        <p className="mt-1 text-xs text-mute">since {formatDate(t.createdAt)}</p>
        {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
      </td>
    </tr>
  );
}
