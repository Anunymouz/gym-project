import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { TrainerMe, TrainerPackageItem } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PackagesManager } from '@/components/trainer/packages-manager';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('trainer', 'packages') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Packages />
    </Suspense>
  );
}

async function Packages() {
  const [me, packages] = await Promise.all([api<TrainerMe>('/v1/trainer/me'), api<TrainerPackageItem[]>('/v1/trainer/packages')]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Packages" subtitle="Sell several sessions at once. Payments go to your payout account, minus BGYM’s fee." />
      <PackagesManager initial={packages} sessionPricePesewas={me.sessionPricePesewas} />
    </div>
  );
}
