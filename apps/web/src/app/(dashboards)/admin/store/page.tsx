import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { SellerAccount, SellerProduct } from '@bgym/shared';
import { PartnersManager } from '@/components/admin/partners-manager';
import { ReviewQueue } from '@/components/admin/review-queue';
import { StoreTabs } from '@/components/admin/store-tabs';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('admin', 'store') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Store />
    </Suspense>
  );
}

async function Store() {
  const [review, sellers] = await Promise.all([api<Array<SellerProduct & { seller: string }>>('/v1/admin/store/review'), api<SellerAccount[]>('/v1/admin/store/sellers')]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Store & partners" subtitle={review.length ? `${review.length} product${review.length > 1 ? 's' : ''} waiting for review` : 'The BGYM Store: partners’ products, BGYM’s own, orders and delivery.'} />
      <StoreTabs current="/admin/store" />
      <section aria-labelledby="review" className="flex flex-col gap-3">
        <h2 id="review" className="text-lg font-extrabold">Waiting for review</h2>
        <ReviewQueue initial={review} />
      </section>
      <PartnersManager initial={sellers} />
    </div>
  );
}
