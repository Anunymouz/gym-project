import Link from 'next/link';
import { formatGhs, pesewas, type GymOverview as Overview, type StaffGym } from '@bgym/shared';
import { Scan } from '@phosphor-icons/react/ssr';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { api } from '@/lib/api.server';
import { channelLabel, daysUntil, formatDateTime, greeting, initials, remindedLabel, requestTime, weekday } from '@/lib/format';
import { RemindButton } from './remind-button';
import { getMe } from '@/lib/session.server';

export async function GymOverview({ gym }: { gym: StaffGym }) {
  const [me, data] = await Promise.all([getMe(), api<Overview>(`/v1/staff/gyms/${gym.id}/overview`)]);
  const now = requestTime();
  const peak = Math.max(1, ...data.checkInsByDay.map((c) => c.count));
  const weekTotal = data.checkInsByDay.reduce((sum, c) => sum + c.count, 0);
  const firstName = me.name?.split(' ')[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting(new Date(now))}${firstName ? `, ${firstName}` : ''}`}
        subtitle={`${gym.name} · ${gym.addressText}`}
        actions={
          <Link href="/gym/check-in" className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14]">
            <Scan size={20} weight="bold" aria-hidden /> Scan check-in
          </Link>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active members" value={String(data.activeMembers)} note="Paid and current" tone="success" />
        <StatCard label="New this month" value={String(data.newThisMonth)} note="First membership here" tone="success" />
        <StatCard label="Expiring in 7 days" value={String(data.expiringIn7Days)} note={data.expiringIn7Days ? 'Remind them to renew' : 'All good'} tone="warning" />
        <StatCard label="Revenue this month" value={formatGhs(pesewas(data.revenueThisMonthPesewas))} note="After BGYM fee" tone="info" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="checkins-title" className="rounded-card border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 id="checkins-title" className="font-bold">Check-ins, last 7 days</h2>
            <span className="text-sm text-mute tabular-nums">{weekTotal} total</span>
          </div>
          <div className="mt-5 flex h-56 items-end gap-3 border-b border-line sm:gap-5" role="img" aria-label={`Daily check-ins: ${data.checkInsByDay.map((c) => `${weekday(c.date)} ${c.count}`).join(', ')}`}>
            {data.checkInsByDay.map((c) => (
              <div key={c.date} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-xs font-bold tabular-nums">{c.count}</span>
                <span className={c.count === peak && c.count > 0 ? 'w-full rounded-t-lg bg-flare' : 'w-full rounded-t-lg bg-[#D9DCEA]'} style={{ height: `${Math.max(4, (c.count / peak) * 180)}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-xs text-mute sm:gap-5" aria-hidden>
            {data.checkInsByDay.map((c) => <span key={c.date} className="flex-1 text-center">{weekday(c.date)}</span>)}
          </div>
        </section>

        <section aria-labelledby="expiring-title" className="rounded-card border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 id="expiring-title" className="font-bold">Expiring soon</h2>
            <Link href="/gym/members?filter=expiring" className="text-sm font-bold text-flare hover:underline">See all</Link>
          </div>
          {data.expiringSoon.length === 0 ? (
            <p className="mt-6 text-mute">No memberships end in the next 7 days.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {data.expiringSoon.map((m) => {
                const days = daysUntil(m.endsAt, now);
                return (
                  <li key={m.membershipId} className="flex items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-50 text-sm font-bold text-violet" aria-hidden>{initials(m.memberName, '?')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{m.memberName ?? 'Member'}</span>
                      <span className="block text-sm text-mute">{m.plan} · {days === 0 ? 'ends today' : `${days} day${days === 1 ? '' : 's'} left`}</span>
                    </span>
                    <RemindButton membershipId={m.membershipId} memberName={m.memberName ?? 'this member'} remindedLabel={remindedLabel(m.lastRemindedAt, now)} />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 border-t border-line pt-3 text-xs text-mute">Members also get automatic emails 7, 3 and 1 days before their membership ends, and on the day it ends.</p>
        </section>
      </div>

      <section aria-labelledby="payments-title" className="rounded-card border border-line bg-white">
        <h2 id="payments-title" className="px-5 pt-5 font-bold">Recent payments</h2>
        {data.recentPayments.length === 0 ? (
          <p className="px-5 pt-4 pb-6 text-mute">Payments appear here as soon as members pay in the BGYM app.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[640px] text-left text-sm">
              <thead className="text-mute">
                <tr className="border-b border-line">
                  {['Member', 'Plan', 'Paid via', 'Amount', 'Date'].map((h) => <th key={h} scope="col" className="px-5 py-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 font-semibold">{p.memberName ?? 'Member'}</td>
                    <td className="px-5 py-3.5">{p.plan}</td>
                    <td className="px-5 py-3.5">{channelLabel(p.channel)}</td>
                    <td className="px-5 py-3.5 font-bold tabular-nums">{formatGhs(pesewas(p.amountPesewas))}</td>
                    <td className="px-5 py-3.5 text-mute">{formatDateTime(p.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
