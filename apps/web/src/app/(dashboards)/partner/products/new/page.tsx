import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { StoreCategory } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { ProductEditor } from '@/components/store/product-editor';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'New product · Partner' };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <New />
    </Suspense>
  );
}

async function New() {
  const categories = await api<StoreCategory[]>('/v1/store/categories');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="New product" />
      <ProductEditor scope="partner" initial={null} categories={categories} listHref="/partner/products" />
    </div>
  );
}
