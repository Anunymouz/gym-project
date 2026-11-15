import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { DeliverySettings, SellerAccount } from '@bgym/shared';
import { DeliveryForm } from '@/components/admin/delivery-form';
import { StoreTabs } from '@/components/admin/store-tabs';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PickupForm } from '@/components/store/pickup-form';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'Delivery · Admin' };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const [delivery, own] = await Promise.all([api<DeliverySettings>('/v1/admin/store/delivery'), api<SellerAccount>('/v1/admin/store/own')]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Store & partners" subtitle="Delivery pricing for every order, and where riders collect BGYM’s own products." />
      <StoreTabs current="/admin/store/settings" />
      <DeliveryForm initial={delivery} />
      <PickupForm scope="own" pickup={own.pickup} />
    </div>
  );
}
