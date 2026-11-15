import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PageSkeleton } from '@/components/dashboard-gate';
import { CheckInDesk } from '@/components/gym/check-in-desk';
import { GymMembers } from '@/components/gym/gym-members';
import { GymPlans } from '@/components/gym/gym-plans';
import { SectionPlaceholder } from '@/components/section-placeholder';
import { PageHeader } from '@/components/ui/page-header';
import { dashboards, findSection, type DashboardId } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export function generateStaticParams() {
  return Object.values(dashboards).flatMap((d) =>
    d.nav.filter((n) => n.slug).map((n) => ({ dashboard: d.id, section: n.slug })),
  );
}

export async function generateMetadata({ params }: PageProps<'/[dashboard]/[section]'>): Promise<Metadata> {
  const { dashboard, section } = await params;
  return { title: findSection(dashboard as DashboardId, section)?.label ?? 'Not found' };
}

// Everything reads the URL inside <Suspense>, so moving between sections shows the skeleton
// straight away instead of waiting on the server.
export default function SectionPage(props: PageProps<'/[dashboard]/[section]'>) {
  return <Suspense fallback={<PageSkeleton />}><Section {...props} /></Suspense>;
}

async function Section({ params, searchParams }: PageProps<'/[dashboard]/[section]'>) {
  const { dashboard, section } = await params;
  const config = dashboards[dashboard as DashboardId];
  const item = config && findSection(config.id, section);
  if (!config || !item) notFound();

  if (config.id === 'gym' && (section === 'members' || section === 'plans' || section === 'check-in')) {
    return <GymSection section={section} searchParams={searchParams} />;
  }
  return <SectionPlaceholder title={item.label} dashboard={config.name} phase={item.phase} />;
}

async function GymSection({ section, searchParams }: { section: 'members' | 'plans' | 'check-in'; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gym = await getCurrentGym();
  if (!gym) return null; // Without a gym, the layout's gate explains why.
  if (section === 'members') return <GymMembers gym={gym} searchParams={await searchParams} />;
  if (section === 'plans') return <GymPlans gym={gym} />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Check-in" subtitle={`${gym.name} · scan the member’s pass in the BGYM app`} />
      <CheckInDesk gymName={gym.name} />
    </div>
  );
}
