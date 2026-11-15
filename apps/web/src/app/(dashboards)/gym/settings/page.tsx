import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { GymPayout, GymPhotoItem, GymProfile, PayoutBank } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { GymSettingsForm } from '@/components/gym/gym-settings-form';
import { PayoutSection } from '@/components/gym/payout-section';
import { PhotosSection } from '@/components/gym/photos-section';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { canManagePlans, getCurrentGym, getMe } from '@/lib/session.server';

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
  const [profile, photos] = await Promise.all([api<GymProfile>(`/v1/staff/gyms/${gym.id}/profile`), api<GymPhotoItem[]>(`/v1/staff/gyms/${gym.id}/photos`)]);
  const canEdit = canManagePlans(gym);
  const badge = statusBadge[profile.status];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        subtitle={canEdit ? 'Your gym’s details in the BGYM app.' : 'Only owners and managers can change these details.'}
        actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
      />
      <PhotosSection initial={photos} canEdit={canEdit} />
      <GymSettingsForm profile={profile} canEdit={canEdit} />
      {gym.role === 'owner' && <Payout gymId={gym.id} />}
    </div>
  );
}

async function Payout({ gymId }: { gymId: string }) {
  const [payout, banks, me] = await Promise.all([api<GymPayout>(`/v1/staff/gyms/${gymId}/payout`), api<PayoutBank[]>('/v1/payouts/banks'), getMe()]);
  return <PayoutSection payout={payout} banks={banks} ownerEmail={me.email} />;
}
