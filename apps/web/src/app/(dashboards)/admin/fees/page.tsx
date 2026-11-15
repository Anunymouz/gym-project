import type { Metadata } from 'next';
import { Suspense } from 'react';
import { formatPercent, type FeeSettings } from '@bgym/shared';
import { FeeForm } from '@/components/admin/fee-form';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: sectionTitle('admin', 'fees') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Fees />
    </Suspense>
  );
}

const pct = (bps: number | null) => (bps === null ? 'the default' : formatPercent(bps));

async function Fees() {
  const settings = await api<FeeSettings>('/v1/admin/fees');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fees" subtitle={`BGYM currently takes ${formatPercent(settings.membershipBps)} of each membership payment.`} />
      <FeeForm currentBps={settings.membershipBps} />
      <p className="text-sm text-mute">Need a different rate for one gym (for example a launch deal)? Set it on the gym’s card under Gyms.</p>

      <section aria-labelledby="history-title" className="rounded-card border border-line bg-white">
        <h2 id="history-title" className="px-5 pt-5 font-bold">Changes</h2>
        {settings.history.length === 0 ? (
          <p className="px-5 pt-2 pb-5 text-mute">No changes yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {settings.history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  {h.gym ? <><span className="font-bold">{h.gym}</span>: special rate {pct(h.fromBps)} → {pct(h.toBps)}</> : <>Default fee {pct(h.fromBps)} → <span className="font-bold">{pct(h.toBps)}</span></>}
                </span>
                <span className="text-mute">{h.by ?? 'Unknown'} · {formatDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
