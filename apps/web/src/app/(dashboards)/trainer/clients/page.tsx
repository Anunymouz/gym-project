import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UsersThree } from '@phosphor-icons/react/ssr';
import type { TrainerClient } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { formatDate, formatDateTime, initials } from '@/lib/format';

export const metadata: Metadata = { title: sectionTitle('trainer', 'clients') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Clients />
    </Suspense>
  );
}

async function Clients() {
  const clients = await api<TrainerClient[]>('/v1/trainer/clients');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Clients" subtitle={clients.length ? `${clients.length} people have booked you` : 'People who book you appear here.'} />
      {clients.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <UsersThree size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No clients yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-mute uppercase">
              <tr><th className="px-5 py-3">Client</th><th className="px-5 py-3">Next session</th><th className="px-5 py-3">Completed</th><th className="px-5 py-3">Package</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-violet-50 text-xs font-bold text-violet">{initials(c.name, c.email)}</span>
                      <div><p className="font-bold">{c.name}</p><p className="text-mute">{c.phone ?? c.email}</p></div>
                    </div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{c.nextSessionAt ? formatDateTime(c.nextSessionAt) : <span className="text-mute">—</span>}</td>
                  <td className="px-5 py-3 tabular-nums">{c.sessions}{c.lastSessionAt && <span className="text-mute"> · last {formatDate(c.lastSessionAt)}</span>}</td>
                  <td className="px-5 py-3">{c.activePackage ? <Badge tone="info">{c.activePackage.sessionsRemaining} left · ends {formatDate(c.activePackage.endsAt)}</Badge> : <span className="text-mute">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
