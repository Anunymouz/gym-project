import Link from 'next/link';
import clsx from 'clsx';
import { MagnifyingGlass, UsersThree } from '@phosphor-icons/react/ssr';
import { membersQuerySchema, type GymMember, type MembersQuery, type StaffGym } from '@bgym/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { formatDate, formatDateTime, initials, remindedLabel, requestTime } from '@/lib/format';
import { RemindButton } from './remind-button';

const filters: Array<{ id: MembersQuery['filter']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring soon' },
  { id: 'expired', label: 'Expired' },
];
const status: Record<GymMember['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  expiring: { label: 'Expiring', tone: 'warning' },
  expired: { label: 'Expired', tone: 'danger' },
};

export async function GymMembers({ gym, searchParams }: { gym: StaffGym; searchParams: Record<string, string | string[] | undefined> }) {
  const parsed = membersQuerySchema.safeParse({ filter: searchParams.filter, q: typeof searchParams.q === 'string' && searchParams.q.trim() ? searchParams.q : undefined });
  const query: MembersQuery = parsed.success ? parsed.data : { filter: 'all' };
  const params = new URLSearchParams({ filter: query.filter, ...(query.q && { q: query.q }) });
  const members = await api<GymMember[]>(`/v1/staff/gyms/${gym.id}/members?${params}`);
  const now = requestTime();

  const hrefFor = (filter: string) => `/gym/members?${new URLSearchParams({ filter, ...(query.q && { q: query.q }) })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Members" subtitle={`${gym.name} · ${members.length} ${members.length === 1 ? 'person' : 'people'}`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter members" className="flex gap-1 overflow-x-auto rounded-control bg-white p-1 ring-1 ring-line">
          {filters.map((f) => (
            <Link
              key={f.id}
              href={hrefFor(f.id)}
              aria-current={query.filter === f.id ? 'page' : undefined}
              className={clsx('rounded-lg px-3 py-1.5 text-sm font-bold whitespace-nowrap', query.filter === f.id ? 'bg-midnight text-white' : 'text-mute hover:text-midnight')}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form role="search" action="/gym/members" className="relative w-full sm:w-72">
          <input type="hidden" name="filter" value={query.filter} />
          <label htmlFor="member-search" className="sr-only">Search members</label>
          <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
          <input id="member-search" name="q" type="search" defaultValue={query.q ?? ''} maxLength={80} placeholder="Search name or email"
            className="h-11 w-full rounded-control border border-line bg-white pr-3 pl-10 text-sm outline-none focus:border-flare" />
        </form>
      </div>

      {members.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <UsersThree size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">{query.q ? `No members match “${query.q}”` : 'No members here yet'}</p>
          <p className="mt-1 text-mute">{query.q ? 'Check the spelling or try their email.' : 'Members appear as soon as they pay in the BGYM app.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-mute">
              <tr className="border-b border-line">
                {['Member', 'Plan', 'Status', 'Ends', 'Last visit', 'Renewal'].map((h) => <th key={h} scope="col" className="px-5 py-3 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-50 text-sm font-bold text-violet" aria-hidden>{initials(m.name, m.email)}</span>
                      <span className="min-w-0">
                        <span className="block font-bold">{m.name ?? 'No name yet'}</span>
                        <span className="block text-mute">{m.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3">{m.plan}</td>
                  <td className="px-5 py-3"><Badge tone={status[m.status].tone}>{status[m.status].label}</Badge></td>
                  <td className="px-5 py-3 tabular-nums">{formatDate(m.endsAt)}</td>
                  <td className="px-5 py-3 text-mute">{m.lastCheckInAt ? formatDateTime(m.lastCheckInAt) : 'Not yet'}</td>
                  <td className="px-5 py-3">
                    {m.status === 'active' ? (
                      <span className="text-xs text-mute">—</span>
                    ) : (
                      <RemindButton membershipId={m.membershipId} memberName={m.name ?? m.email} remindedLabel={remindedLabel(m.lastRemindedAt, now)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
