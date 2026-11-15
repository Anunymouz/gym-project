import { formatGhs, pesewas, planPeriodLabel, type StaffGym, type StaffPlan } from '@bgym/shared';
import { Tag } from '@phosphor-icons/react/ssr';
import { setPlanActive } from '@/app/(dashboards)/gym-actions';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { canManagePlans } from '@/lib/session.server';
import { PlanEditor } from './plan-editor';

export async function GymPlans({ gym }: { gym: StaffGym }) {
  const plans = await api<StaffPlan[]>(`/v1/staff/gyms/${gym.id}/plans`);
  const manage = canManagePlans(gym);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Plans"
        subtitle={manage ? 'What members can buy in the BGYM app. Changes show in the app straight away.' : 'Only owners and managers can change plans.'}
        actions={manage ? <PlanEditor mode="create" /> : undefined}
      />

      {plans.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Tag size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No plans yet</p>
          <p className="mt-1 text-mute">Add a plan so members can join {gym.name} in the app.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className={p.isActive ? 'flex flex-col rounded-card border border-line bg-white p-5' : 'flex flex-col rounded-card border border-dashed border-[#C9CDE0] bg-white/60 p-5'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold">{p.name}</h2>
                  <p className="text-sm text-mute">{planPeriodLabel(p.durationDays)}</p>
                </div>
                <Badge tone={p.isActive ? 'success' : 'info'}>{p.isActive ? 'On sale' : 'Paused'}</Badge>
              </div>
              <p className="mt-3 text-3xl font-extrabold tabular-nums">{formatGhs(pesewas(p.pricePesewas))}</p>
              {p.description && <p className="mt-2 text-sm text-mute">{p.description}</p>}
              <p className="mt-3 text-sm font-semibold">{p.activeMembers} active {p.activeMembers === 1 ? 'member' : 'members'}</p>
              {manage && (
                <div className="mt-auto flex gap-2 pt-4">
                  <PlanEditor mode="edit" plan={p} />
                  <form action={setPlanActive}>
                    <input type="hidden" name="planId" value={p.id} />
                    <input type="hidden" name="isActive" value={String(!p.isActive)} />
                    <button type="submit" className="h-10 rounded-control border-[1.5px] border-line px-3.5 text-sm font-bold hover:bg-cloud">
                      {p.isActive ? 'Pause sales' : 'Put on sale'}
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {manage && <p className="text-sm text-mute">Pausing a plan stops new sales. Members who already paid keep their access until their end date.</p>}
    </div>
  );
}
