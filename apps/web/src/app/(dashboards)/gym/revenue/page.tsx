import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CaretLeft, CaretRight, DownloadSimple, LockKey, Wallet } from '@phosphor-icons/react/ssr';
import { formatGhs, formatPercent, monthSchema, pesewas, type RevenueMonth } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { channelLabel, formatDateTime } from '@/lib/format';
import { canManagePlans, getCurrentGym, getGymFee } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'revenue') };

const monthName = (key: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const shift = (key: string, by: number) => {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const ghs = (p: number) => formatGhs(pesewas(p));

export default function Page({ searchParams }: PageProps<'/gym/revenue'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Revenue searchParams={searchParams} />
    </Suspense>
  );
}

async function Revenue({ searchParams }: Pick<PageProps<'/gym/revenue'>, 'searchParams'>) {
  const gym = await getCurrentGym();
  if (!gym) return null;
  if (!canManagePlans(gym)) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Revenue" subtitle={gym.name} />
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <LockKey size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">Only owners and managers can see revenue</p>
        </div>
      </div>
    );
  }

  const requested = monthSchema.safeParse((await searchParams).month);
  const [data, fee] = await Promise.all([api<RevenueMonth>(`/v1/staff/gyms/${gym.id}/revenue${requested.success ? `?month=${requested.data}` : ''}`), getGymFee(gym.id)]);
  const current = data.months.at(0) ?? data.month;
  const isLatest = data.month >= current;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Revenue"
        subtitle={`${gym.name} · BGYM’s fee: ${formatPercent(fee.bps)} of each payment`}
        actions={
          data.totals.payments > 0 && (
            <a href={`/gym/revenue/export?month=${data.month}`} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line bg-white px-4 text-sm font-bold hover:bg-cloud" download>
              <DownloadSimple size={18} weight="bold" aria-hidden /> Download CSV
            </a>
          )
        }
      />

      <nav aria-label="Month" className="flex items-center gap-2">
        <Link href={`/gym/revenue?month=${shift(data.month, -1)}`} aria-label="Previous month" className="grid size-10 place-items-center rounded-control border border-line bg-white hover:bg-cloud">
          <CaretLeft size={18} weight="bold" aria-hidden />
        </Link>
        <h2 className="min-w-44 text-center text-lg font-extrabold" aria-live="polite">{monthName(data.month)}</h2>
        {isLatest ? (
          <span aria-hidden className="grid size-10 place-items-center rounded-control border border-line bg-white opacity-40"><CaretRight size={18} weight="bold" /></span>
        ) : (
          <Link href={`/gym/revenue?month=${shift(data.month, 1)}`} aria-label="Next month" className="grid size-10 place-items-center rounded-control border border-line bg-white hover:bg-cloud">
            <CaretRight size={18} weight="bold" aria-hidden />
          </Link>
        )}
      </nav>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Total label="Your share" value={ghs(data.totals.netPesewas)} note="After BGYM’s fee" strong />
        <Total label="Members paid" value={ghs(data.totals.grossPesewas)} note={`${data.totals.payments} payment${data.totals.payments === 1 ? '' : 's'}`} />
        <Total label="BGYM fee" value={ghs(data.totals.feePesewas)} note={data.totals.grossPesewas ? `${((data.totals.feePesewas / data.totals.grossPesewas) * 100).toFixed(1)}% of payments` : '—'} />
        <Total label="Average payment" value={data.totals.payments ? ghs(Math.round(data.totals.grossPesewas / data.totals.payments)) : '—'} note="Per membership" />
      </section>

      {data.totals.payments === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Wallet size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No payments in {monthName(data.month)}</p>
          <p className="mt-1 text-mute">Membership payments made in the BGYM app appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_2.2fr]">
          <section aria-labelledby="plans-title" className="self-start rounded-card border border-line bg-white p-5">
            <h2 id="plans-title" className="font-bold">By plan</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {data.byPlan.map((p) => (
                <li key={p.plan}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{p.plan} <span className="font-normal text-mute">· {p.payments}</span></span>
                    <span className="font-bold tabular-nums">{ghs(p.netPesewas)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-cloud" aria-hidden>
                    <div className="h-2 rounded-full bg-flare" style={{ width: `${Math.max(2, (p.netPesewas / data.totals.netPesewas) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="payments-title" className="rounded-card border border-line bg-white">
            <h2 id="payments-title" className="px-5 pt-5 font-bold">Payments</h2>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[820px] text-left text-sm">
                <thead className="text-mute">
                  <tr className="border-b border-line">
                    {['Date', 'Member', 'Plan', 'Paid via', 'Amount', 'BGYM fee', 'Your share'].map((h, i) => (
                      <th key={h} scope="col" className={`px-5 py-3 font-semibold whitespace-nowrap ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 whitespace-nowrap text-mute">{formatDateTime(p.paidAt)}</td>
                      <td className="px-5 py-3 font-semibold whitespace-nowrap">{p.memberName ?? 'Member'}</td>
                      <td className="px-5 py-3">{p.plan}</td>
                      <td className="px-5 py-3 whitespace-nowrap">{channelLabel(p.channel)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{ghs(p.grossPesewas)}</td>
                      <td className="px-5 py-3 text-right text-mute tabular-nums">{ghs(p.feePesewas)}</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums">{ghs(p.netPesewas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      <p className="text-sm text-mute">Paystack deducts its own processing fee from your share when it pays out, so bank deposits can be slightly lower than “Your share”.</p>
    </div>
  );
}

function Total({ label, value, note, strong }: { label: string; value: string; note: string; strong?: boolean }) {
  return (
    <div className={strong ? 'min-w-0 rounded-card bg-midnight p-4 text-white sm:p-5' : 'min-w-0 rounded-card border border-line bg-white p-4 sm:p-5'}>
      <p className={strong ? 'text-sm font-semibold text-white/70' : 'text-sm font-semibold text-mute'}>{label}</p>
      <p className="mt-1.5 truncate text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      <p className={strong ? 'mt-1 text-sm text-white/70' : 'mt-1 text-sm text-mute'}>{note}</p>
    </div>
  );
}
