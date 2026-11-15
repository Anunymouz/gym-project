import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Clock, LockSimple, Plus } from '@phosphor-icons/react/ssr';
import { WORKOUT_GOALS, WORKOUT_LEVELS, type AdminWorkout } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { WorkoutTabs } from '@/components/workouts/workout-tabs';
import { api } from '@/lib/api.server';
import { mediaSrc } from '@/lib/media';

export const metadata: Metadata = { title: 'Workouts · Admin' };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Workouts />
    </Suspense>
  );
}

async function Workouts() {
  const workouts = await api<AdminWorkout[]>('/v1/admin/workouts');
  const live = workouts.filter((w) => w.isPublished);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Workouts"
        subtitle={`${live.length} in the app (${live.filter((w) => w.isFree).length} free). Paid workouts unlock when a member joins any gym.`}
        actions={<Link href="/admin/workouts/new" className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14]"><Plus size={18} weight="bold" aria-hidden /> New workout</Link>}
      />
      <WorkoutTabs current="/admin/workouts" />
      {workouts.length === 0 ? (
        <p className="rounded-card border border-line bg-white p-8 text-center text-mute">No workouts yet. Build one from the exercise library.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workouts.map((w) => (
            <li key={w.id}>
              <Link href={`/admin/workouts/${w.id}`} className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative aspect-[16/9] bg-cloud">
                  {w.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- server-resized
                    <img src={mediaSrc(w.coverUrl)} alt="" className="size-full object-cover" />
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <Badge tone={w.isPublished ? 'success' : 'neutral'}>{w.isPublished ? 'Published' : 'Draft'}</Badge>
                    {w.isFree ? <Badge tone="warning">Free</Badge> : <span className="inline-flex items-center gap-1 rounded-full bg-midnight/80 px-2.5 py-0.5 text-xs font-bold text-white"><LockSimple size={12} weight="bold" aria-hidden /> Members</span>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <p className="font-extrabold group-hover:text-flare">{w.title}</p>
                  <p className="text-sm text-mute">{WORKOUT_LEVELS[w.level]} · {WORKOUT_GOALS[w.goal]}</p>
                  <p className="mt-auto flex items-center gap-3 pt-2 text-xs font-semibold text-mute">
                    <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden /> {w.durationMin} min</span>
                    <span>{w.exerciseCount} exercises</span>
                    <span>Done {w.sessions}×</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
