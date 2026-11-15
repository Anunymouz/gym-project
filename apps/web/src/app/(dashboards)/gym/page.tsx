import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/dashboard-gate';
import { GymOverview } from '@/components/gym/gym-overview';
import { sectionTitle } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', '') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const gym = await getCurrentGym();
  return gym ? <GymOverview gym={gym} /> : null; // Without a gym, the layout's gate explains why.
}
