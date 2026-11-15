import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { GymPayout, PayoutBank, TrainerMe } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PayoutSection } from '@/components/gym/payout-section';
import { PhotoCard } from '@/components/trainer/photo-card';
import { ProfileForm } from '@/components/trainer/profile-form';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { requestTrainerPayoutCode, saveTrainerPayout } from '../../trainer-actions';

export const metadata: Metadata = { title: sectionTitle('trainer', 'settings') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const [me, payout, banks] = await Promise.all([api<TrainerMe>('/v1/trainer/me'), api<GymPayout>('/v1/trainer/payout'), api<PayoutBank[]>('/v1/trainer/payout/banks')]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle={`${me.name ?? me.email} · trainer at ${me.gym.name}`} />
      <PhotoCard photoUrl={me.photoUrl} name={me.name} />
      <ProfileForm me={me} />
      <PayoutSection
        payout={payout}
        banks={banks}
        ownerEmail={me.email}
        description="Where your session and package payments are sent by Paystack, minus BGYM’s fee."
        requestCode={requestTrainerPayoutCode}
        save={saveTrainerPayout}
      />
    </div>
  );
}
