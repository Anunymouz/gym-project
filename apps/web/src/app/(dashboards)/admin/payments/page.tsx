import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { CaretLeft, CaretRight, Wallet } from '@phosphor-icons/react/ssr';
import { formatGhs, formatPercent, pesewas, type AdminPaymentsMonth, type FeeSettings } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('admin', 'payments') };

const monthName = (key: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const shift = (key: string, by: number) => {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const ghs = (p: number) => formatGhs(pesewas(p));

export default function Page({ searchParams }: PageProps<'/admin/payments'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

async function Payments({ searchParams }: Pick<PageProps<'/admin/payments'>, 'searchParams'>) {
  const { month } = await searchParams;
  const valid = typeof month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
  const [data, fees] = await Promise.all([api<AdminPaymentsMonth>(`/v1/admin/payments${valid ? `?month=${month}` : ''}`), api<FeeSettings>('/v1/admin/fees')]);
  const isLatest = data.month >= (data.months[0] ?? data.month);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payments" subtitle={`Membership payments through BGYM · current fee ${formatPercent(fees.membershipBps)}`} />
      <nav aria-label="Month" className="flex items-center gap-2">
        <Link href={`/admin/payments?month=${shift(data.month, -1)}`} aria-label="Previous month" className="grid size-10 place-items-center rounded-control border border-line bg-white hover:bg-cloud"><CaretLeft size={18} weight="bold" aria-hidden /></Link>
        <h2 className="min-w-44 text-center text-lg font-extrabold" aria-live="polite">{monthName(data.month)}</h2>
        {isLatest ? (
          <span aria-hidden className="grid size-10 place-items-center rounded-control border border-line bg-white opacity-40"><CaretRight size={18} weight="bold" /></span>
        ) : (
          <Link href={`/admin/payments?month=${shift(data.month, 1)}`} aria-label="Next month" className="grid size-10 place-items-center rounded-control border border-line bg-white hover:bg-cloud"><CaretRight size={18} weight="bold" aria-hidden /></Link>
        )}
      </nav>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Total label="BGYM earned" value={ghs(data.totals.feePesewas)} note="Fees, paid into BGYM’s Paystack account" strong />
        <Total label="Members paid" value={ghs(data.totals.grossPesewas)} note={`${data.totals.payments} payments`} />
        <Total label="Paid to gyms" value={ghs(data.totals.gymsPesewas)} note="Before Paystack’s fee" />
        <Total label="Gyms with sales" value={String(data.byGym.length)} note={monthName(data.month)} />
      </section>

      {data.byGym.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Wallet size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No payments in {monthName(data.month)}</p>
        </div>
      ) : (
        <section aria-labelledby="by-gym" className="overflow-x-auto rounded-card border border-line bg-white">
          <h2 id="by-gym" className="px-5 pt-5 font-bold">By gym</h2>
          <table className="mt-2 w-full min-w-[720px] text-left text-sm">
            <thead className="text-mute">
              <tr className="border-b border-line">
                {['Gym', 'Fee rate', 'Payments', 'Members paid', 'BGYM earned', 'Gym receives'].map((h, i) => (
                  <th key={h} scope="col" className={`px-5 py-3 font-semibold whitespace-nowrap ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.byGym.map((g) => (
                <tr key={g.gymId} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-semibold">{g.gym}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{formatPercent(g.feeBps ?? fees.membershipBps)}{g.feeBps !== null && <span className="text-mute"> · special</span>}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{g.payments}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{ghs(g.grossPesewas)}</td>
                  <td className="px-5 py-3 text-right font-bold text-flare tabular-nums">{ghs(g.feePesewas)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{ghs(g.grossPesewas - g.feePesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-sm text-mute">Fee rate shows today’s rate; each payment keeps the fee it was charged when it was made.</p>
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
