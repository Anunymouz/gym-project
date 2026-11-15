import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Confetti } from '@phosphor-icons/react/ssr';
import type { AdminGym, FeeSettings } from '@bgym/shared';
import { AdminGymCard } from '@/components/admin/admin-gym-card';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('admin', 'approvals') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Approvals />
    </Suspense>
  );
}

async function Approvals() {
  const [queue, fees] = await Promise.all([api<AdminGym[]>('/v1/admin/gyms?status=pending_review'), api<FeeSettings>('/v1/admin/fees')]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Gym approvals" subtitle={queue.length ? `${queue.length} waiting · oldest first` : 'Gyms sent for review appear here.'} />
      {queue.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Confetti size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">Nothing waiting</p>
          <p className="mt-1 text-mute">You’re all caught up.</p>
        </div>
      ) : (
        queue.map((gym) => <AdminGymCard key={gym.id} gym={gym} defaultFeeBps={fees.membershipBps} />)
      )}
    </div>
  );
}
