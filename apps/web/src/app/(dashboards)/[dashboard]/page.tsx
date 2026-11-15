import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PageSkeleton } from '@/components/dashboard-gate';
import { GymOverview } from '@/components/gym/gym-overview';
import { SectionPlaceholder } from '@/components/section-placeholder';
import { dashboards, type DashboardId } from '@/lib/dashboards';
import { getCurrentGym } from '@/lib/session.server';

export function generateStaticParams() {
  return Object.keys(dashboards).map((dashboard) => ({ dashboard }));
}

export async function generateMetadata({ params }: PageProps<'/[dashboard]'>): Promise<Metadata> {
  const { dashboard } = await params;
  return { title: dashboards[dashboard as DashboardId]?.name ?? 'Dashboard' };
}

export default function DashboardHome(props: PageProps<'/[dashboard]'>) {
  return <Suspense fallback={<PageSkeleton />}><Home {...props} /></Suspense>;
}

async function Home({ params }: PageProps<'/[dashboard]'>) {
  const { dashboard } = await params;
  const config = dashboards[dashboard as DashboardId];
  if (!config) notFound();
  if (config.id === 'gym') return <GymHome />;
  const home = config.nav[0]!;
  return <SectionPlaceholder title={home.label} dashboard={config.name} phase={home.phase} />;
}

async function GymHome() {
  const gym = await getCurrentGym();
  return gym ? <GymOverview gym={gym} /> : null; // Without a gym, the layout's gate explains why.
}
