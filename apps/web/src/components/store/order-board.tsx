'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, MapPin, Moped, Package, Phone, Prohibit, Warning } from '@phosphor-icons/react';
import { formatGhs, ORDER_STATUS_LABELS, pesewas, type OrderAction, type SellerOrder } from '@bgym/shared';
import { orderAction } from '@/app/(dashboards)/store-actions';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import { mediaSrc } from '@/lib/media';

const ghs = (p: number) => formatGhs(pesewas(p));
const TONE: Record<SellerOrder['status'], 'success' | 'info' | 'warning' | 'danger'> = {
  pending_payment: 'warning', paid: 'warning', preparing: 'info', ready_for_pickup: 'info', out_for_delivery: 'info', delivered: 'success', delivery_failed: 'danger', cancelled: 'danger', refunded: 'danger',
};

/** A seller's orders, each with the next step: prepare, ready, hand to a rider, delivered. */
export function OrderBoard({ scope, initial, showSeller }: { scope: 'partner' | 'own'; initial: SellerOrder[]; showSeller?: boolean }) {
  const [orders, setOrders] = useState(initial);
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => <OrderCard key={o.id} scope={scope} order={o} showSeller={showSeller} onChange={(n) => setOrders((l) => l.map((x) => (x.id === n.id ? n : x)))} />)}
    </ul>
  );
}

function OrderCard({ scope, order: o, showSeller, onChange }: { scope: 'partner' | 'own'; order: SellerOrder; showSeller?: boolean; onChange: (o: SellerOrder) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rider, setRider] = useState<{ name: string; phone: string } | null>(null);
  const act = (action: OrderAction) =>
    start(async () => {
      const res = await orderAction(scope, o.id, action);
      if (res.data) {
        onChange(res.data);
        setRider(null);
      }
      setError(res.error ?? null);
    });
  const map = `https://www.google.com/maps/search/?api=1&query=${o.address.latitude},${o.address.longitude}`;
  const btn = 'inline-flex h-10 items-center gap-1.5 rounded-control px-3.5 text-sm font-bold disabled:opacity-60';

  return (
    <li className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold">{o.number} <Badge tone={TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge></p>
          <p className="text-sm text-mute">{formatDateTime(o.createdAt)}{showSeller ? ` · ${o.seller}` : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold tabular-nums">{ghs(o.subtotalPesewas)}</p>
          <p className="text-xs text-mute">items{o.commissionPesewas > 0 ? ` · BGYM fee ${ghs(o.commissionPesewas)}` : ''} · delivery {ghs(o.deliveryFeePesewas)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ul className="flex flex-col gap-2">
          {o.items.map((i, n) => (
            <li key={n} className="flex items-center gap-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
              {i.thumbUrl ? <img src={mediaSrc(i.thumbUrl)} alt="" className="size-11 rounded-lg object-cover" /> : <span className="grid size-11 place-items-center rounded-lg bg-cloud"><Package size={18} aria-hidden /></span>}
              <span className="flex-1"><span className="font-bold">{i.quantity} ×</span> {i.title}</span>
              <span className="tabular-nums text-mute">{ghs(i.unitPricePesewas * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5 rounded-control bg-cloud p-3 text-sm">
          <p className="font-bold">{o.customer.name}</p>
          <a href={`tel:${o.customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-flare"><Phone size={15} aria-hidden /> {o.customer.phone}</a>
          <a href={map} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 hover:text-flare"><MapPin size={15} className="mt-0.5 shrink-0" aria-hidden /> <span>{o.address.addressText}{o.address.landmark ? ` · ${o.address.landmark}` : ''} <span className="text-flare underline">(map)</span></span></a>
          {o.note && <p className="mt-1 rounded bg-white px-2 py-1">“{o.note}”</p>}
          {o.delivery?.courierName && <p className="mt-1 inline-flex items-center gap-1.5 font-semibold"><Moped size={16} aria-hidden /> {o.delivery.courierName} · {o.delivery.courierPhone}</p>}
        </div>
      </div>

      {rider ? (
        <form onSubmit={(e) => { e.preventDefault(); act({ action: 'dispatch', courierName: rider.name, courierPhone: rider.phone }); }} className="mt-4 flex flex-wrap items-end gap-2 rounded-control border border-line p-3">
          <div className="flex flex-col gap-1"><label htmlFor={`rn-${o.id}`} className="text-xs font-bold">Rider’s name</label><input id={`rn-${o.id}`} required value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} className="h-10 rounded-control border border-line px-3 outline-none focus:border-flare" /></div>
          <div className="flex flex-col gap-1"><label htmlFor={`rp-${o.id}`} className="text-xs font-bold">Rider’s phone</label><input id={`rp-${o.id}`} required inputMode="tel" value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} placeholder="024 123 4567" className="h-10 rounded-control border border-line px-3 outline-none focus:border-flare" /></div>
          <button type="submit" disabled={pending} className={`${btn} bg-flare text-white`}>{pending ? <CircleNotch size={16} className="animate-spin" aria-hidden /> : <Moped size={16} aria-hidden />} Out for delivery</button>
          <button type="button" onClick={() => setRider(null)} className={`${btn} hover:bg-cloud`}>Back</button>
          <p className="w-full text-xs text-mute">The customer sees the rider’s name and number so they can coordinate.</p>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {o.status === 'paid' && <button type="button" disabled={pending} onClick={() => act({ action: 'preparing' })} className={`${btn} bg-midnight text-white`}>Start preparing</button>}
          {(o.status === 'paid' || o.status === 'preparing') && <button type="button" disabled={pending} onClick={() => act({ action: 'ready' })} className={`${btn} bg-midnight text-white`}><Package size={16} aria-hidden /> Ready for the rider</button>}
          {(o.status === 'ready_for_pickup' || o.status === 'delivery_failed') && <button type="button" disabled={pending} onClick={() => setRider({ name: '', phone: '' })} className={`${btn} bg-flare text-white`}><Moped size={16} aria-hidden /> Hand to a rider</button>}
          {o.status === 'out_for_delivery' && (
            <>
              <button type="button" disabled={pending} onClick={() => act({ action: 'delivered' })} className={`${btn} bg-success text-white`}><CheckCircle size={16} weight="bold" aria-hidden /> Delivered</button>
              <button type="button" disabled={pending} onClick={() => { const note = prompt('What went wrong? (the customer will be contacted)'); if (note && note.trim().length >= 3) act({ action: 'failed', note }); }} className={`${btn} border-[1.5px] border-line hover:bg-cloud`}><Warning size={16} aria-hidden /> Couldn’t deliver</button>
            </>
          )}
          {['paid', 'preparing', 'ready_for_pickup', 'delivery_failed'].includes(o.status) && (
            <button type="button" disabled={pending} onClick={() => { const reason = prompt(`Cancel ${o.number}? The customer gets a full refund. Reason:`); if (reason && reason.trim().length >= 3) act({ action: 'cancel', reason }); }} className={`${btn} text-danger hover:bg-danger-50`}><Prohibit size={16} aria-hidden /> Cancel and refund</button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}
