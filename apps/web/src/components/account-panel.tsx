import { SignOut } from '@phosphor-icons/react/ssr';
import { signOut, switchGym } from '@/app/(dashboards)/actions';
import { getCurrentGym, getMe, getStaffGyms } from '@/lib/session.server';
import type { DashboardId } from '@/lib/dashboards';
import { GymSwitcher } from './gym-switcher';

const roleLabel = { owner: 'Owner', manager: 'Manager', front_desk: 'Front desk' } as const;

/** Signed-in account (and, on the gym dashboard, the gym being managed) at the foot of the sidebar. */
export async function AccountPanel({ dashboard }: { dashboard: DashboardId }) {
  const me = await getMe();
  const [gyms, gym] = dashboard === 'gym' ? await Promise.all([getStaffGyms(), getCurrentGym()]) : [[], null];

  return (
    <div className="mt-4 rounded-card bg-white/5 p-3 text-sm">
      {gym && (
        <div className="mb-3 border-b border-white/10 pb-3">
          {gyms.length > 1 ? (
            <GymSwitcher gyms={gyms.map((g) => ({ id: g.id, name: g.name }))} current={gym.id} action={switchGym} />
          ) : (
            <p className="font-bold text-white">{gym.name}</p>
          )}
          <p>{roleLabel[gym.role]}</p>
        </div>
      )}
      <p className="truncate font-bold text-white">{me.name ?? 'Your account'}</p>
      <p className="truncate">{me.email}</p>
      <form action={signOut} className="mt-2.5">
        <button type="submit" className="inline-flex items-center gap-1.5 font-semibold text-white/80 hover:text-white">
          <SignOut size={18} aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );
}

export function AccountPanelSkeleton() {
  return (
    <div className="mt-4 animate-pulse rounded-card bg-white/5 p-3" aria-hidden>
      <div className="h-4 w-3/4 rounded bg-white/10" />
      <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
    </div>
  );
}
