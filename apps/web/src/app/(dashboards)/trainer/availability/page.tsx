import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { TrainerAvailability } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { AvailabilityEditor } from '@/components/trainer/availability-editor';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('trainer', 'availability') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Availability />
    </Suspense>
  );
}

async function Availability() {
  const availability = await api<TrainerAvailability>('/v1/trainer/availability');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Availability" subtitle="Members can book you 2 hours to 30 days ahead, inside these hours." />
      <AvailabilityEditor initial={availability} />
    </div>
  );
}
