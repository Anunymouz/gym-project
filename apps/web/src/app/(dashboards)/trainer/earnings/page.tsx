import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CaretLeft, CaretRight, Wallet } from '@phosphor-icons/react/ssr';
import { formatGhs, formatPercent, monthSchema, pesewas, type TrainerEarnings, type TrainerMe } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: sectionTitle('trainer', 'earnings') };

const monthName = (key: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const ghs = (p: number) => formatGhs(pesewas(p));

export default function Page({ searchParams }: PageProps<'/trainer/earnings'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Earnings searchParams={searchParams} />
    </Suspense>
  );
}

async function Earnings({ searchParams }: Pick<PageProps<'/trainer/earnings'>, 'searchParams'>) {
  const requested = monthSchema.safeParse((await searchParams).month);
  const [data, me] = await Promise.all([api<TrainerEarnings>(`/v1/trainer/earnings${requested.success ? `?month=${requested.data}` : ''}`), api<TrainerMe>('/v1/trainer/me')]);
  const index = data.months.indexOf(data.month);
  const older = data.months[index + 1];
  const newer = index > 0 ? data.months[index - 1] : undefined;
  const arrow = 'grid size-10 place-items-center rounded-control border border-line bg-white hover:bg-cloud';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Earnings" subtitle={`Paystack sends your share to your payout account. BGYM’s fee: ${formatPercent(me.feeBps)} of each payment.`} />
      <nav aria-label="Month" className="flex items-center gap-2">
        {older ? <Link href={`/trainer/earnings?month=${older}`} aria-label="Previous month" className={arrow}><CaretLeft size={18} weight="bold" aria-hidden /></Link> : <span className={`${arrow} opacity-40`} aria-hidden><CaretLeft size={18} weight="bold" /></span>}
        <h2 className="min-w-44 text-center text-lg font-extrabold">{monthName(data.month)}</h2>
        {newer ? <Link href={`/trainer/earnings?month=${newer}`} aria-label="Next month" className={arrow}><CaretRight size={18} weight="bold" aria-hidden /></Link> : <span className={`${arrow} opacity-40`} aria-hidden><CaretRight size={18} weight="bold" /></span>}
      </nav>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="You receive" value={ghs(data.totals.netPesewas)} note="after BGYM’s fee" tone="success" />
        <StatCard label="Clients paid" value={ghs(data.totals.grossPesewas)} note={`${data.totals.payments} payments`} tone="info" />
        <StatCard label="BGYM’s fee" value={ghs(data.totals.feePesewas)} note={formatPercent(me.feeBps)} tone="warning" />
      </div>
      {data.payments.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Wallet size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No payments this month</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-mute uppercase">
              <tr><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">For</th><th className="px-5 py-3 text-right">Paid</th><th className="px-5 py-3 text-right">You receive</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.payments.map((p) => (
                <tr key={p.id} className={p.refunded ? 'text-mute' : ''}>
                  <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(p.paidAt)}</td>
                  <td className="px-5 py-3 font-semibold">{p.client}</td>
                  <td className="px-5 py-3">{p.description} {p.refunded && <Badge tone="danger">Refunded</Badge>}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{ghs(p.grossPesewas)}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{p.refunded ? '—' : ghs(p.grossPesewas - p.feePesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-mute">Paystack’s own processing fee also comes out of your share before it reaches your account.</p>
    </div>
  );
}
