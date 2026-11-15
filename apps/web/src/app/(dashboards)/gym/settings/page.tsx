import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { GymProfile } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { GymSettingsForm } from '@/components/gym/gym-settings-form';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { canManagePlans, getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'settings') };

const statusBadge: Record<GymProfile['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Live in the app', tone: 'success' },
  pending_review: { label: 'Waiting for review', tone: 'warning' },
  draft: { label: 'Draft', tone: 'info' },
  suspended: { label: 'Suspended', tone: 'danger' },
};

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const gym = await getCurrentGym();
  if (!gym) return null;
  const profile = await api<GymProfile>(`/v1/staff/gyms/${gym.id}/profile`);
  const canEdit = canManagePlans(gym);
  const badge = statusBadge[profile.status];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        subtitle={canEdit ? 'Your gym’s details in the BGYM app.' : 'Only owners and managers can change these details.'}
        actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
      />
      <GymSettingsForm profile={profile} canEdit={canEdit} />
    </div>
  );
}
