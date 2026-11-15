import Link from 'next/link';

const TABS = [
  { href: '/admin/workouts', label: 'Workouts' },
  { href: '/admin/workouts/exercises', label: 'Exercise library' },
] as const;

/** Sections of the Workouts area in the admin dashboard. */
export function WorkoutTabs({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav aria-label="Workouts" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={current === t.href ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-bold ${current === t.href ? 'bg-midnight text-white' : 'bg-white hover:bg-cloud'}`}>{t.label}</Link>
      ))}
    </nav>
  );
}
