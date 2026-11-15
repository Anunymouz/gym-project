import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ssr';
import type { ExerciseItem } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { ExerciseEditor } from '@/components/workouts/exercise-editor';
import { api } from '@/lib/api.server';

export const metadata: Metadata = { title: 'Exercise · Admin' };

export default function Page({ params }: PageProps<'/admin/workouts/exercises/[id]'>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<'/admin/workouts/exercises/[id]'>['params'] }) {
  const { id } = await params;
  const exercise = await api<ExerciseItem>(`/v1/admin/exercises/${encodeURIComponent(id)}`);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/workouts/exercises" className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-mute hover:text-flare"><ArrowLeft size={16} aria-hidden /> Exercise library</Link>
      <PageHeader title={exercise.name} />
      <ExerciseEditor initial={exercise} />
    </div>
  );
}
