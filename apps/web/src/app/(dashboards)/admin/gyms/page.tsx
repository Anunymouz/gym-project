import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import clsx from 'clsx';
import { MagnifyingGlass } from '@phosphor-icons/react/ssr';
import { adminGymsQuerySchema, type AdminGym, type FeeSettings } from '@bgym/shared';
import { AdminGymCard } from '@/components/admin/admin-gym-card';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('admin', 'gyms') };

const filters = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Live' },
  { id: 'pending_review', label: 'Waiting' },
  { id: 'draft', label: 'Draft' },
  { id: 'suspended', label: 'Paused' },
] as const;

export default function Page({ searchParams }: PageProps<'/admin/gyms'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gyms searchParams={searchParams} />
    </Suspense>
  );
}

async function Gyms({ searchParams }: Pick<PageProps<'/admin/gyms'>, 'searchParams'>) {
  const sp = await searchParams;
  const parsed = adminGymsQuerySchema.safeParse({ status: sp.status, q: typeof sp.q === 'string' && sp.q.trim() ? sp.q : undefined });
  const query = parsed.success ? parsed.data : { status: 'all' as const, q: undefined };
  const params = new URLSearchParams({ status: query.status, ...(query.q && { q: query.q }) });
  const [gyms, fees] = await Promise.all([api<AdminGym[]>(`/v1/admin/gyms?${params}`), api<FeeSettings>('/v1/admin/fees')]);
  const href = (status: string) => `/admin/gyms?${new URLSearchParams({ status, ...(query.q && { q: query.q }) })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Gyms" subtitle={`${gyms.length} ${gyms.length === 1 ? 'gym' : 'gyms'}`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter gyms" className="flex gap-1 overflow-x-auto rounded-control bg-white p-1 ring-1 ring-line">
          {filters.map((f) => (
            <Link key={f.id} href={href(f.id)} aria-current={query.status === f.id ? 'page' : undefined} className={clsx('rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap', query.status === f.id ? 'bg-midnight text-white' : 'text-mute hover:text-midnight')}>
              {f.label}
            </Link>
          ))}
        </nav>
        <form role="search" action="/admin/gyms" className="relative w-full sm:w-72">
          <input type="hidden" name="status" value={query.status} />
          <label htmlFor="gym-search" className="sr-only">Search gyms</label>
          <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
          <input id="gym-search" name="q" type="search" defaultValue={query.q ?? ''} maxLength={80} placeholder="Search name or area" className="h-11 w-full rounded-control border border-line bg-white pr-3 pl-10 text-sm outline-none focus:border-flare" />
        </form>
      </div>
      {gyms.length === 0 ? <p className="rounded-card border border-line bg-white px-6 py-10 text-center text-mute">No gyms match.</p> : gyms.map((g) => <AdminGymCard key={g.id} gym={g} defaultFeeBps={fees.membershipBps} />)}
    </div>
  );
}
