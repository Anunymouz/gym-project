import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Barbell } from '@phosphor-icons/react/ssr';
import { formatPercent, type AdminTrainer, type FeeSettings } from '@bgym/shared';
import { TrainerAdminRow } from '@/components/admin/trainer-admin-row';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('admin', 'trainers') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Trainers />
    </Suspense>
  );
}

async function Trainers() {
  const [trainers, fees] = await Promise.all([api<AdminTrainer[]>('/v1/admin/trainers'), api<FeeSettings>('/v1/admin/fees')]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Trainers" subtitle={`${trainers.filter((t) => t.listed && t.status === 'active').length} live · default fee ${formatPercent(fees.trainerBps)}. Leave the fee empty to use the default.`} />
      {trainers.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Barbell size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No trainers yet</p>
          <p className="text-sm text-mute">Gyms invite their trainers from their dashboard.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-xs text-mute uppercase">
              <tr><th className="px-5 py-3">Trainer</th><th className="px-5 py-3">Gym</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Sessions</th><th className="px-5 py-3">Fee</th><th className="px-5 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line">{trainers.map((t) => <TrainerAdminRow key={t.id} trainer={t} defaultBps={fees.trainerBps} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
