import type { ReactNode } from 'react';
import Link from 'next/link';
import { LockKey, Storefront } from '@phosphor-icons/react/ssr';
import type { AuthUser } from '@bgym/shared';
import { dashboards, type DashboardId } from '@/lib/dashboards';
import { getMe, getStaffGyms } from '@/lib/session.server';

const roleFor: Record<Exclude<DashboardId, 'gym'>, AuthUser['roles'][number]> = { trainer: 'trainer', partner: 'partner', admin: 'admin' };

/**
 * Shows a dashboard only to people it is for. This is a courtesy for the screen: the API
 * enforces the same rules on every request, so hiding a page is never the only protection.
 */
export async function DashboardGate({ dashboard, children }: { dashboard: DashboardId; children: ReactNode }) {
  const me = await getMe();
  const isAdmin = me.roles.includes('admin');

  if (dashboard === 'gym') {
    const gyms = await getStaffGyms();
    if (gyms.length === 0) {
      return (
        <Notice icon={<Storefront size={30} weight="duotone" aria-hidden />} title="No gym is linked to your account yet">
          Ask the gym owner to add <span className="font-bold text-midnight">{me.email}</span> as staff, or contact the BGYM team to list your gym.
        </Notice>
      );
    }
    return children;
  }

  if (isAdmin || me.roles.includes(roleFor[dashboard])) return children;
  return (
    <Notice icon={<LockKey size={30} weight="duotone" aria-hidden />} title={`The ${dashboards[dashboard].name.toLowerCase()} is not on your account`}>
      You are signed in as <span className="font-bold text-midnight">{me.email}</span>.{' '}
      <Link href="/gym" className="font-bold text-flare hover:underline">Go to the gym dashboard</Link>
    </Notice>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-flare-50 text-flare">{icon}</span>
      <h1 className="mt-4 text-xl font-extrabold">{title}</h1>
      <p className="mt-1 max-w-md text-mute">{children}</p>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 rounded-lg bg-line" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-card bg-white" />)}
      </div>
      <div className="h-72 rounded-card bg-white" />
    </div>
  );
}
