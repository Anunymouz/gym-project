import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { GymTeam } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { TeamManager } from '@/components/gym/team-manager';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'staff') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Staff />
    </Suspense>
  );
}

async function Staff() {
  const gym = await getCurrentGym();
  if (!gym) return null;
  const team = await api<GymTeam>(`/v1/staff/gyms/${gym.id}/team`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Staff" subtitle={`Who can use ${gym.name}’s dashboard. Owners manage everyone; managers can add front desk.`} />
      <TeamManager initial={team} myRole={gym.role} />
    </div>
  );
}
