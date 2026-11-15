import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Plus } from '@phosphor-icons/react/ssr';
import type { SellerProduct } from '@bgym/shared';
import { StoreTabs } from '@/components/admin/store-tabs';
import { PageSkeleton } from '@/components/dashboard-gate';
import { ProductTable } from '@/components/store/product-table';
import { StockTable } from '@/components/store/stock-table';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'BGYM products · Admin' };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  const products = await api<SellerProduct[]>('/v1/admin/store/own/products');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Store & partners" subtitle="Products BGYM sells itself. They go live as soon as you publish them." actions={<Link href="/admin/store/products/new" className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14]"><Plus size={18} weight="bold" aria-hidden /> New product</Link>} />
      <StoreTabs current="/admin/store/products" />
      <ProductTable products={products} base="/admin/store/products" />
      {products.length > 0 && (
        <section aria-labelledby="stock" className="flex flex-col gap-3">
          <h2 id="stock" className="text-lg font-extrabold">Stock</h2>
          <StockTable scope="own" products={products} />
        </section>
      )}
    </div>
  );
}
