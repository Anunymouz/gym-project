import { formatGhs, pesewas } from '@bgym/shared';
import { BellRinging, Scan } from '@phosphor-icons/react/ssr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SampleDataNote } from '@/components/ui/sample-data-note';
import { StatCard } from '@/components/ui/stat-card';

// Placeholder figures until Phase 1 connects these widgets to the API.
const checkIns = [
  { day: 'Fri', count: 62 }, { day: 'Sat', count: 80 }, { day: 'Sun', count: 74 }, { day: 'Mon', count: 95 },
  { day: 'Tue', count: 88 }, { day: 'Wed', count: 120 }, { day: 'Thu', count: 54 },
];
const expiring = [
  { name: 'Ama Owusu', plan: 'Monthly', days: 2 },
  { name: 'Kojo Darko', plan: 'Quarterly', days: 3 },
  { name: 'Abena Ofori', plan: 'Monthly', days: 5 },
  { name: 'Selorm Agbeko', plan: 'Monthly', days: 6 },
];
const payments = [
  { member: 'Nana Yeboah', plan: 'Monthly', via: 'MTN MoMo', amount: 35000, when: 'Today, 08:12' },
  { member: 'Esi Quaye', plan: 'Day pass', via: 'Telecel Cash', amount: 4000, when: 'Today, 07:40' },
  { member: 'Kwesi Appiah', plan: 'Quarterly', via: 'Card', amount: 95000, when: 'Yesterday' },
];

export function GymOverview() {
  const peak = Math.max(...checkIns.map((c) => c.count));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Good morning, Kofi"
        subtitle="Iron Haven Fitness · East Legon"
        actions={
          <Button>
            <Scan size={20} weight="bold" aria-hidden />
            Scan check-in
          </Button>
        }
      />
      <SampleDataNote phase={1} />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active members" value="248" note="+12 this week" tone="success" />
        <StatCard label="New this month" value="31" note="+18% vs October" tone="success" />
        <StatCard label="Expiring in 7 days" value="19" note="Send reminders" tone="warning" />
        <StatCard label="Revenue this month" value={formatGhs(pesewas(6_420_000))} note="After platform fee" tone="info" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="checkins-title" className="rounded-card border border-line bg-white p-5">
          <h2 id="checkins-title" className="font-bold">Check-ins this week</h2>
          <div className="mt-5 flex h-56 items-end gap-3 border-b border-line sm:gap-5" role="img" aria-label={`Daily check-ins, busiest day ${peak}`}>
            {checkIns.map((c) => (
              <div key={c.day} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-xs font-bold tabular-nums">{c.count}</span>
                <span
                  className={c.count === peak ? 'w-full rounded-t-lg bg-flare' : 'w-full rounded-t-lg bg-[#D9DCEA]'}
                  style={{ height: `${(c.count / peak) * 180}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-xs text-mute sm:gap-5">
            {checkIns.map((c) => (
              <span key={c.day} className="flex-1 text-center">{c.day}</span>
            ))}
          </div>
        </section>

        <section aria-labelledby="expiring-title" className="rounded-card border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 id="expiring-title" className="font-bold">Expiring soon</h2>
            <button type="button" className="inline-flex items-center gap-1.5 text-sm font-bold text-flare">
              <BellRinging size={18} weight="bold" aria-hidden />
              Remind all
            </button>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {expiring.map((m) => (
              <li key={m.name} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-50 text-sm font-bold text-violet" aria-hidden>
                  {m.name.split(' ').map((p) => p[0]).join('')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{m.name}</span>
                  <span className="block text-sm text-mute">{m.plan} · {m.days} days left</span>
                </span>
                <Badge tone="warning">Remind</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="payments-title" className="rounded-card border border-line bg-white">
        <h2 id="payments-title" className="px-5 pt-5 font-bold">Recent payments</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[640px] text-left text-sm">
            <thead className="text-mute">
              <tr className="border-b border-line">
                {['Member', 'Plan', 'Paid via', 'Amount', 'Date', 'Status'].map((h) => (
                  <th key={h} scope="col" className="px-5 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.member} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-semibold">{p.member}</td>
                  <td className="px-5 py-3.5">{p.plan}</td>
                  <td className="px-5 py-3.5">{p.via}</td>
                  <td className="px-5 py-3.5 font-bold tabular-nums">{formatGhs(pesewas(p.amount))}</td>
                  <td className="px-5 py-3.5 text-mute">{p.when}</td>
                  <td className="px-5 py-3.5"><Badge tone="success">Active</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
