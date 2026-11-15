import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/dashboard-gate';
import { GymMembers } from '@/components/gym/gym-members';
import { sectionTitle } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'members') };

export default function Page({ searchParams }: PageProps<'/gym/members'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Members searchParams={searchParams} />
    </Suspense>
  );
}

async function Members({ searchParams }: Pick<PageProps<'/gym/members'>, 'searchParams'>) {
  const gym = await getCurrentGym();
  return gym ? <GymMembers gym={gym} searchParams={await searchParams} /> : null;
}
