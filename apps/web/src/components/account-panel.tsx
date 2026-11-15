import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import type { AuthUser, StaffGym } from '@bgym/shared';
import { SignOut } from '@phosphor-icons/react/ssr';
import { signOut, switchGym } from '@/app/(dashboards)/actions';
import { getCurrentGym, getMe, getStaffGyms } from '@/lib/session.server';
import type { DashboardId } from '@/lib/dashboards';
import { initials } from '@/lib/format';
import { GymSwitcher } from './gym-switcher';

const roleLabel = { owner: 'Owner', manager: 'Manager', front_desk: 'Front desk' } as const;

/** Signed-in account (and, on the gym dashboard, the gym being managed) at the foot of the sidebar. */
export async function AccountPanel({ dashboard }: { dashboard: DashboardId }) {
  let me: AuthUser;
  let gyms: StaffGym[] = [];
  let gym: StaffGym | null = null;
  try {
    me = await getMe();
    if (dashboard === 'gym') [gyms, gym] = await Promise.all([getStaffGyms(), getCurrentGym()]);
  } catch (err) {
    unstable_rethrow(err); // keep Next's redirects (e.g. session expired → sign-in)
    // The API is unreachable: the page shows its own retry; keep sign-out available here.
    return (
      <form action={signOut} className="mt-4 rounded-card bg-white/5 p-3 text-sm lg:collapsed:bg-transparent lg:collapsed:p-0">
        <p className="lg:collapsed:sr-only">Account unavailable</p>
        <button type="submit" className="mt-1 inline-flex items-center gap-1.5 font-semibold text-white/80 hover:text-white">
          <SignOut size={18} aria-hidden /> <span className="lg:collapsed:sr-only">Sign out</span>
        </button>
      </form>
    );
  }

  return (
    <>
      {/* Collapsed rail: avatar and sign-out only. */}
      <div className="mt-4 hidden flex-col items-center gap-2 lg:collapsed:flex">
        <span
          title={`${me.name ?? me.email}${gym ? ` · ${gym.name}` : ''}`}
          className="grid size-10 place-items-center rounded-full bg-flare/20 text-sm font-bold text-white"
        >
          {initials(me.name, me.email)}
          <span className="sr-only">Signed in as {me.name ?? me.email}</span>
        </span>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="grid size-10 place-items-center rounded-control text-sidebar-mute hover:bg-white/10 hover:text-white"
          >
            <SignOut size={20} aria-hidden />
          </button>
        </form>
      </div>
      <div className="mt-4 rounded-card bg-white/5 p-3 text-sm lg:collapsed:hidden">
        {gym && (
          <div className="mb-3 border-b border-white/10 pb-3">
            {gyms.length > 1 ? (
              <GymSwitcher
                gyms={gyms.map((g) => ({ id: g.id, name: g.name }))}
                current={gym.id}
                action={switchGym}
              />
            ) : (
              <p className="font-bold text-white">{gym.name}</p>
            )}
            <p>{roleLabel[gym.role]}</p>
            <Link href="/apply" className="mt-1.5 inline-block text-xs font-semibold text-white/70 hover:text-white">
              + List another gym
            </Link>
          </div>
        )}
        <p className="truncate font-bold text-white">{me.name ?? 'Your account'}</p>
        <p className="truncate">{me.email}</p>
        <form action={signOut} className="mt-2.5">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 font-semibold text-white/80 hover:text-white"
          >
            <SignOut size={18} aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export function AccountPanelSkeleton() {
  return (
    <div
      className="mt-4 animate-pulse rounded-card bg-white/5 p-3 lg:collapsed:mx-auto lg:collapsed:size-10 lg:collapsed:rounded-full lg:collapsed:p-0 lg:collapsed:[&>*]:hidden"
      aria-hidden
    >
      <div className="h-4 w-3/4 rounded bg-white/10" />
      <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
    </div>
  );
}
