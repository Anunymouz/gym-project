import type { Metadata } from 'next';
import { Suspense } from 'react';
import { formatPercent, type SellerAccount } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PickupForm } from '@/components/store/pickup-form';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('partner', 'settings') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const me = await api<SellerAccount>('/v1/partner/me');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle={me.name} />
      <PickupForm scope="partner" pickup={me.pickup} />
      <section className="rounded-card border border-line bg-white p-5 text-sm">
        <h2 className="text-lg font-extrabold">Your account</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div><dt className="text-mute">Contact</dt><dd className="font-semibold">{me.contactEmail} · {me.contactPhone}</dd></div>
          <div><dt className="text-mute">BGYM commission</dt><dd className="font-semibold">{formatPercent(me.commissionBps)} of each sale</dd></div>
          <div><dt className="text-mute">People with access</dt><dd className="font-semibold">{me.users.map((u) => u.name ?? u.email).join(', ')}</dd></div>
        </dl>
        <p className="mt-3 text-mute">To change your commission, name or team, contact the BGYM team.</p>
      </section>
    </div>
  );
}
