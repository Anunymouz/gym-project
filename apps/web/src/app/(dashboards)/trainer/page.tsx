import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CalendarBlank } from '@phosphor-icons/react/ssr';
import { formatGhs, pesewas, type TrainerBooking, type TrainerEarnings, type TrainerMe } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { BookingRow } from '@/components/trainer/booking-row';
import { SetupCard } from '@/components/trainer/setup-card';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { greeting, requestTime } from '@/lib/format';

export const metadata: Metadata = { title: sectionTitle('trainer', '') };

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date(iso));
const dayLabel = (key: string, today: string, tomorrow: string) =>
  key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Schedule />
    </Suspense>
  );
}

async function Schedule() {
  const [me, upcoming, earnings] = await Promise.all([api<TrainerMe>('/v1/trainer/me'), api<TrainerBooking[]>('/v1/trainer/bookings?scope=upcoming'), api<TrainerEarnings>('/v1/trainer/earnings')]);
  const now = requestTime();
  const today = dayKey(new Date(now).toISOString());
  const tomorrow = dayKey(new Date(now + 86_400_000).toISOString());
  const week = upcoming.filter((b) => Date.parse(b.startsAt) < now + 7 * 86_400_000);
  const byDay = new Map<string, TrainerBooking[]>();
  for (const b of week) byDay.set(dayKey(b.startsAt), [...(byDay.get(dayKey(b.startsAt)) ?? []), b]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`${greeting(new Date(now))}, ${me.name?.split(' ')[0] ?? 'coach'}`} subtitle={`Trainer at ${me.gym.name}`} />
      <SetupCard me={me} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="Sessions today" value={String(byDay.get(today)?.length ?? 0)} note={`${week.length} this week`} tone="info" />
        <StatCard label="Earned this month" value={formatGhs(pesewas(earnings.totals.netPesewas))} note={`${earnings.totals.payments} payments`} tone="success" />
        <StatCard label="Your price" value={me.sessionPricePesewas ? formatGhs(pesewas(me.sessionPricePesewas)) : '—'} note={`${me.sessionDurationMin} min sessions`} tone="warning" />
      </div>
      <section aria-labelledby="week" className="flex flex-col gap-3">
        <h2 id="week" className="text-lg font-extrabold">Your next 7 days</h2>
        {week.length === 0 ? (
          <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
            <CalendarBlank size={36} weight="duotone" className="text-violet" aria-hidden />
            <p className="mt-3 font-bold">No sessions booked yet</p>
            <p className="text-sm text-mute">{me.listed ? 'Bookings from the app appear here, and we email you each one.' : 'Finish setting up and show yourself in the app to start taking bookings.'}</p>
          </div>
        ) : (
          [...byDay.entries()].map(([key, items]) => (
            <div key={key} className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-mute uppercase">{dayLabel(key, today, tomorrow)}</h3>
              <ul className="flex flex-col gap-2">{items.map((b) => <BookingRow key={b.id} booking={b} now={now} />)}</ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
