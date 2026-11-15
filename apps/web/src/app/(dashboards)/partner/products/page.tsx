import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Plus } from '@phosphor-icons/react/ssr';
import type { SellerProduct } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { ProductTable } from '@/components/store/product-table';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('partner', 'products') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  const products = await api<SellerProduct[]>('/v1/partner/products');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Products"
        subtitle="New products and changes to live ones are checked by the BGYM team before members see them."
        actions={<Link href="/partner/products/new" className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14]"><Plus size={18} weight="bold" aria-hidden /> New product</Link>}
      />
      <ProductTable products={products} base="/partner/products" />
    </div>
  );
}
