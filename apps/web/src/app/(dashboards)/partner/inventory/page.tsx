import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { SellerProduct } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { StockTable } from '@/components/store/stock-table';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('partner', 'inventory') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Inventory />
    </Suspense>
  );
}

async function Inventory() {
  const products = await api<SellerProduct[]>('/v1/partner/products');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Inventory" subtitle="Update stock as deliveries arrive. Stock held for orders being paid can’t be removed." />
      <StockTable scope="partner" products={products} />
    </div>
  );
}
