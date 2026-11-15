import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { MagnifyingGlass, Plus } from '@phosphor-icons/react/ssr';
import { BODY_PARTS, type ExerciseItem } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ExerciseImport } from '@/components/workouts/exercise-import';
import { ExerciseThumb } from '@/components/workouts/exercise-thumb';
import { WorkoutTabs } from '@/components/workouts/workout-tabs';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'Exercise library · Admin' };

export default function Page({ searchParams }: PageProps<'/admin/workouts/exercises'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Library searchParams={searchParams} />
    </Suspense>
  );
}

/** "Legs · Quadriceps · Dumbbells", without repeating a word ("Chest · Chest"). */
const exerciseLine = (e: ExerciseItem) => [...new Set([BODY_PARTS[e.bodyPart as keyof typeof BODY_PARTS] ?? e.bodyPart, e.targetMuscle, e.equipment].filter(Boolean))].join(' · ');
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 60) : '');

async function Library({ searchParams }: { searchParams: PageProps<'/admin/workouts/exercises'>['searchParams'] }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const part = one(sp.part);
  const bodyPart = part in BODY_PARTS ? part : '';
  const query = new URLSearchParams({ ...(q && { q }), ...(bodyPart && { bodyPart }) });
  const exercises = await api<ExerciseItem[]>(`/v1/admin/exercises${query.size ? `?${query}` : ''}`);
  const withDemo = exercises.filter((e) => e.media).length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Workouts"
        subtitle="BGYM’s own exercises, with demos you film, plus any imported from a licensed library."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/workouts/exercises/new" className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14]"><Plus size={18} weight="bold" aria-hidden /> New exercise</Link>
          </div>
        }
      />
      <WorkoutTabs current="/admin/workouts/exercises" />
      <div className="flex flex-wrap items-start gap-3">
        <form className="flex flex-1 flex-wrap gap-2" role="search">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Search exercises</span>
            <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
            <input type="search" name="q" defaultValue={q} placeholder="Search by name" className="h-11 w-full rounded-control border border-line bg-white pr-3 pl-9 outline-none focus:border-flare" />
          </label>
          <select name="part" defaultValue={bodyPart} aria-label="Body part" className="h-11 rounded-control border border-line bg-white px-3 outline-none focus:border-flare">
            <option value="">All body parts</option>
            {Object.entries(BODY_PARTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="h-11 rounded-control bg-midnight px-4 text-sm font-bold text-white hover:bg-indigo">Search</button>
        </form>
        <ExerciseImport />
      </div>
      <p className="text-sm text-mute">{exercises.length} exercise{exercises.length === 1 ? '' : 's'}{exercises.length > 0 && `, ${withDemo} with a demo`}.</p>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {exercises.map((e) => (
          <li key={e.id} className="min-w-0">
            <Link href={`/admin/workouts/exercises/${e.id}`} className={`flex items-center gap-3 rounded-card border border-line bg-white p-3 hover:border-flare ${e.isActive ? '' : 'opacity-60'}`}>
              <ExerciseThumb media={e.media} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{e.name}</span>
                <span className="block truncate text-sm text-mute">{exerciseLine(e)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {!e.media && <Badge tone="warning">No demo</Badge>}
                {!e.isActive && <Badge tone="neutral">Hidden</Badge>}
                {e.source !== 'bgym' && <Badge tone="info">{e.source}</Badge>}
                <span className="text-xs text-mute">{e.usedIn > 0 ? `In ${e.usedIn} workout${e.usedIn === 1 ? '' : 's'}` : 'Unused'}</span>
              </span>
            </Link>
          </li>
        ))}
        {exercises.length === 0 && <li className="rounded-card border border-line bg-white p-8 text-center text-mute md:col-span-2">No exercises match.</li>}
      </ul>
    </div>
  );
}
