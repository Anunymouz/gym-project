import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { GymTrainers } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { TrainersManager } from '@/components/gym/trainers-manager';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { canManagePlans, getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'trainers') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Trainers />
    </Suspense>
  );
}

async function Trainers() {
  const gym = await getCurrentGym();
  if (!gym) return null;
  const data = await api<GymTrainers>(`/v1/staff/gyms/${gym.id}/trainers`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Trainers" subtitle={`Personal trainers members can book at ${gym.name}.`} />
      <TrainersManager initial={data} canManage={canManagePlans(gym)} />
    </div>
  );
}
