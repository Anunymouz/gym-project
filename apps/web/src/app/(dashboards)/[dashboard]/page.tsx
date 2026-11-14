import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GymOverview } from '@/components/gym/gym-overview';
import { SectionPlaceholder } from '@/components/section-placeholder';
import { dashboards, type DashboardId } from '@/lib/dashboards';

export function generateStaticParams() {
  return Object.keys(dashboards).map((dashboard) => ({ dashboard }));
}

export async function generateMetadata({ params }: PageProps<'/[dashboard]'>): Promise<Metadata> {
  const { dashboard } = await params;
  return { title: dashboards[dashboard as DashboardId]?.name ?? 'Dashboard' };
}

export default async function DashboardHome({ params }: PageProps<'/[dashboard]'>) {
  const { dashboard } = await params;
  const config = dashboards[dashboard as DashboardId];
  if (!config) notFound();
  if (config.id === 'gym') return <GymOverview />;
  const home = config.nav[0]!;
  return <SectionPlaceholder title={home.label} dashboard={config.name} phase={home.phase} />;
}
