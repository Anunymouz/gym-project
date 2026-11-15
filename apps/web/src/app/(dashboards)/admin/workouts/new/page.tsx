import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ssr';
import type { ExerciseItem } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { WorkoutBuilder } from '@/components/workouts/workout-builder';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'New workout · Admin' };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <New />
    </Suspense>
  );
}

async function New() {
  const library = await api<ExerciseItem[]>('/v1/admin/exercises');
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/workouts" className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-mute hover:text-flare"><ArrowLeft size={16} aria-hidden /> Workouts</Link>
      <PageHeader title="New workout" />
      <WorkoutBuilder initial={null} library={library} />
    </div>
  );
}
