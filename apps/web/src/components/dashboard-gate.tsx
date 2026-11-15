import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect, unstable_rethrow } from 'next/navigation';
import { Storefront } from '@phosphor-icons/react/ssr';
import type { AuthUser } from '@bgym/shared';
import type { DashboardId } from '@/lib/dashboards';
import { getMe, getStaffGyms } from '@/lib/session.server';

const roleFor: Record<Exclude<DashboardId, 'gym'>, AuthUser['roles'][number]> = { trainer: 'trainer', partner: 'partner', admin: 'admin' };

/**
 * Shows a dashboard only to people it is for. This is a courtesy for the screen: the API
 * enforces the same rules on every request, so hiding a page is never the only protection.
 * People without the role are sent to the gym dashboard (by proxy.ts, before rendering). Gym pages always render (they show
 * nothing without a gym), so the "no gym yet" notice sits above them rather than replacing them.
 */
export async function DashboardGate({ dashboard, children }: { dashboard: DashboardId; children: ReactNode }) {
  try {
    return await gate(dashboard, children);
  } catch (err) {
    unstable_rethrow(err); // keep redirects (sign-in, wrong dashboard)
    // API unreachable: let the page render so its own "Try again" screen shows inside the
    // sidebar. Safe: this gate is only for the screen; proxy.ts and the API enforce access.
    return children;
  }
}

async function gate(dashboard: DashboardId, children: ReactNode) {
  const me = await getMe();
  const isAdmin = me.roles.includes('admin');

  if (dashboard === 'gym') {
    const gyms = await getStaffGyms();
    return (
      <>
        {gyms.length === 0 && (
          <Notice icon={<Storefront size={30} weight="duotone" aria-hidden />} title="No gym is linked to your account yet">
            If you work at a gym on BGYM, ask the owner to add <span className="font-bold text-midnight">{me.email}</span> as staff. Own a gym? List it in a few minutes.
            <Link href="/apply" className="mt-4 inline-flex h-11 items-center rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14]">
              List your gym
            </Link>
          </Notice>
        )}
        {children}
      </>
    );
  }

  // proxy.ts normally redirects before this renders; this covers a token whose roles just changed.
  if (!isAdmin && !me.roles.includes(roleFor[dashboard])) redirect('/gym');
  return children;
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-flare-50 text-flare">{icon}</span>
      <h1 className="mt-4 text-xl font-extrabold">{title}</h1>
      <div className="mt-1 flex max-w-md flex-col items-center text-mute">{children}</div>
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
