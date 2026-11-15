import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/dashboard-gate';
import { GymPlans } from '@/components/gym/gym-plans';
import { sectionTitle } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'plans') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plans />
    </Suspense>
  );
}

async function Plans() {
  const gym = await getCurrentGym();
  return gym ? <GymPlans gym={gym} /> : null;
}
