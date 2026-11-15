import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CheckCircle, Circle, Receipt } from '@phosphor-icons/react/ssr';
import type { SellerAccount, SellerOrder } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { OrderBoard } from '@/components/store/order-board';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('partner', '') };

export default function Page({ searchParams }: PageProps<'/partner'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: Pick<PageProps<'/partner'>, 'searchParams'>) {
  const filter = (await searchParams).filter === 'done' ? 'done' : 'open';
  const [me, orders] = await Promise.all([api<SellerAccount>('/v1/partner/me'), api<SellerOrder[]>(`/v1/partner/orders?filter=${filter}`)]);
  const steps = [
    { done: !!me.pickup, label: 'Pickup point', href: '/partner/settings#pickup' },
    { done: me.payoutConnected, label: 'Payout account', href: '/partner/payouts' },
    { done: me.products.active > 0, label: 'A live product', href: '/partner/products' },
  ];
  const tab = (f: 'open' | 'done', label: string) => (
    <Link href={f === 'done' ? '/partner?filter=done' : '/partner'} aria-current={filter === f ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === f ? 'bg-midnight text-white' : 'bg-white hover:bg-cloud'}`}>{label}</Link>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Orders" subtitle={`${me.name} · BGYM Store partner`} />
      {!me.isActive && <p role="alert" className="rounded-card border border-danger/30 bg-danger-50 p-4 font-semibold text-danger">Your store is paused by the BGYM team, so your products are hidden. Contact BGYM.</p>}
      {steps.some((s) => !s.done) && (
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="text-lg font-extrabold">Get ready to sell</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.label}><Link href={s.href} className="flex items-center gap-2 rounded-control border border-line px-3 py-2.5 text-sm font-semibold hover:border-flare">{s.done ? <CheckCircle size={20} weight="fill" className="text-success" aria-label="Done" /> : <Circle size={20} className="text-mute" aria-label="To do" />}<span className={s.done ? 'text-mute line-through' : ''}>{s.label}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
      <nav aria-label="Orders" className="flex gap-2">{tab('open', 'To do')}{tab('done', 'Completed & cancelled')}</nav>
      {orders.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Receipt size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">{filter === 'open' ? 'No orders to handle' : 'Nothing here yet'}</p>
          <p className="text-sm text-mute">New orders appear here, and we email you each one.</p>
        </div>
      ) : (
        <OrderBoard scope="partner" initial={orders} />
      )}
    </div>
  );
}
