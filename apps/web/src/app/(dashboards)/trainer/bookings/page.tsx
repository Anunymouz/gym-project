import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import type { TrainerBooking } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { BookingRow } from '@/components/trainer/booking-row';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { requestTime } from '@/lib/format';

export const metadata: Metadata = { title: sectionTitle('trainer', 'bookings') };

export default function Page({ searchParams }: PageProps<'/trainer/bookings'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<'/trainer/bookings'>, 'searchParams'>) {
  const scope = (await searchParams).scope === 'past' ? 'past' : 'upcoming';
  const bookings = await api<TrainerBooking[]>(`/v1/trainer/bookings?scope=${scope}`);
  const now = requestTime();
  const tab = (s: 'upcoming' | 'past', label: string) => (
    <Link href={`/trainer/bookings${s === 'past' ? '?scope=past' : ''}`} aria-current={scope === s ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-bold ${scope === s ? 'bg-midnight text-white' : 'bg-white text-midnight hover:bg-cloud'}`}>{label}</Link>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Bookings" subtitle="Mark sessions completed or as no-shows once they’ve started. Cancelling refunds your client." />
      <nav aria-label="Bookings" className="flex gap-2">{tab('upcoming', 'Upcoming')}{tab('past', 'Past & cancelled')}</nav>
      {bookings.length === 0 ? (
        <p className="rounded-card border border-dashed border-[#C9CDE0] bg-white px-6 py-12 text-center text-mute">{scope === 'upcoming' ? 'No upcoming sessions.' : 'Nothing here yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-2">{bookings.map((b) => <BookingRow key={b.id} booking={b} showDay now={now} />)}</ul>
      )}
    </div>
  );
}
