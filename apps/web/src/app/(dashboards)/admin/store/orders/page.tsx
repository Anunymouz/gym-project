import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Receipt } from '@phosphor-icons/react/ssr';
import type { SellerOrder } from '@bgym/shared';
import { StoreTabs } from '@/components/admin/store-tabs';
import { PageSkeleton } from '@/components/dashboard-gate';
import { OrderBoard } from '@/components/store/order-board';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'Store orders · Admin' };

export default function Page({ searchParams }: PageProps<'/admin/store/orders'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: Pick<PageProps<'/admin/store/orders'>, 'searchParams'>) {
  const filter = (await searchParams).filter === 'done' ? 'done' : 'open';
  const orders = await api<SellerOrder[]>(`/v1/admin/store/orders?filter=${filter}`);
  const tab = (f: 'open' | 'done', label: string) => (
    <Link href={f === 'done' ? '/admin/store/orders?filter=done' : '/admin/store/orders'} aria-current={filter === f ? 'page' : undefined} className={`rounded-full px-3 py-1.5 text-sm font-bold ${filter === f ? 'bg-flare text-white' : 'bg-white hover:bg-cloud'}`}>{label}</Link>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Store & partners" subtitle="Every order: BGYM’s own (handle them here) and partners’ (step in if something goes wrong)." />
      <StoreTabs current="/admin/store/orders" />
      <nav aria-label="Filter" className="flex gap-2">{tab('open', 'Open')}{tab('done', 'Completed & cancelled')}</nav>
      {orders.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center"><Receipt size={36} weight="duotone" className="text-violet" aria-hidden /><p className="mt-3 font-bold">No orders here</p></div>
      ) : (
        <OrderBoard scope="own" initial={orders} showSeller />
      )}
    </div>
  );
}
