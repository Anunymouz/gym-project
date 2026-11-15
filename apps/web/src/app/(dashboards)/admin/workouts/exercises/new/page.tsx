import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react/ssr';
import { PageHeader } from '@/components/ui/page-header';
import { ExerciseEditor } from '@/components/workouts/exercise-editor';

export const metadata: Metadata = { title: 'New exercise · Admin' };

export default function Page() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/workouts/exercises" className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-mute hover:text-flare"><ArrowLeft size={16} aria-hidden /> Exercise library</Link>
      <PageHeader title="New exercise" />
      <ExerciseEditor initial={null} />
    </div>
  );
}
