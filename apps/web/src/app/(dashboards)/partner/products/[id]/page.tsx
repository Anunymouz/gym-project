import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ssr';
import type { SellerProduct, StoreCategory } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { ProductEditor } from '@/components/store/product-editor';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'Product · Partner' };

export default function Page({ params }: PageProps<'/partner/products/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<'/partner/products/[id]'>['params'] }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([api<SellerProduct>(`/v1/partner/products/${encodeURIComponent(id)}`), api<StoreCategory[]>('/v1/store/categories')]);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/partner/products" className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-mute hover:text-flare"><ArrowLeft size={16} aria-hidden /> All products</Link>
      <PageHeader title={product.title} />
      <ProductEditor scope="partner" initial={product} categories={categories} listHref="/partner/products" />
    </div>
  );
}
