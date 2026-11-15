'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, Confetti } from '@phosphor-icons/react';
import { formatGhs, pesewas, type SellerProduct } from '@bgym/shared';
import { reviewProduct } from '@/app/(dashboards)/store-actions';
import { mediaSrc } from '@/lib/media';

type Item = SellerProduct & { seller: string };

/** Partners' products waiting for a check: approve, or send back with a note. */
export function ReviewQueue({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  if (items.length === 0) {
    return (
      <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-10 text-center">
        <Confetti size={32} weight="duotone" className="text-violet" aria-hidden />
        <p className="mt-2 font-bold">Nothing waiting for review</p>
      </div>
    );
  }
  return <ul className="flex flex-col gap-3">{items.map((p) => <ReviewCard key={p.id} item={p} onDone={() => setItems((l) => l.filter((x) => x.id !== p.id))} />)}</ul>;
}

function ReviewCard({ item: p, onDone }: { item: Item; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (decision: { decision: 'approve' } | { decision: 'reject'; note: string }) =>
    start(async () => {
      const res = await reviewProduct(p.id, decision);
      if (res.error) setError(res.error);
      else onDone();
    });
  return (
    <li className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold">{p.title}</p>
          <p className="text-sm text-mute">{p.seller}{p.brand ? ` · ${p.brand}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={() => setRejecting((r) => !r)} className="h-10 rounded-control border-[1.5px] border-line px-3.5 text-sm font-bold hover:bg-cloud">Send back</button>
          <button type="button" disabled={pending} onClick={() => decide({ decision: 'approve' })} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-success px-3.5 text-sm font-bold text-white"><CheckCircle size={16} weight="bold" aria-hidden /> Approve</button>
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
        {p.images.map((i) => <img key={i.id} src={mediaSrc(i.thumbUrl)} alt="" className="size-24 shrink-0 rounded-lg object-cover" />)}
      </div>
      {p.description && <p className="mt-3 text-sm whitespace-pre-wrap">{p.description}</p>}
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {p.variants.filter((v) => v.isActive).map((v) => <li key={v.id} className="rounded-full bg-cloud px-3 py-1">{v.name} · {formatGhs(pesewas(v.pricePesewas))} · {v.stock} in stock</li>)}
      </ul>
      {rejecting && (
        <form onSubmit={(e) => { e.preventDefault(); decide({ decision: 'reject', note }); }} className="mt-3 flex flex-wrap gap-2">
          <label htmlFor={`note-${p.id}`} className="sr-only">What should the partner change?</label>
          <input id={`note-${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What should they change? e.g. Add a clear photo of the label." className="h-10 min-w-72 flex-1 rounded-control border border-line px-3 outline-none focus:border-flare" />
          <button type="submit" disabled={pending || note.trim().length < 5} className="h-10 rounded-control bg-midnight px-4 text-sm font-bold text-white disabled:opacity-50">Send back with note</button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}
