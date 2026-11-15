import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/dashboard-gate';
import { CheckInDesk } from '@/components/gym/check-in-desk';
import { PageHeader } from '@/components/ui/page-header';
import { sectionTitle } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'check-in') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Desk />
    </Suspense>
  );
}

async function Desk() {
  const gym = await getCurrentGym();
  if (!gym) return null;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Check-in" subtitle={`${gym.name} · scan the member’s pass in the BGYM app`} />
      <CheckInDesk gymName={gym.name} />
    </div>
  );
}
