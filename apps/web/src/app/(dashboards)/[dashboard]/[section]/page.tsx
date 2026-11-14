import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionPlaceholder } from '@/components/section-placeholder';
import { dashboards, findSection, type DashboardId } from '@/lib/dashboards';

export function generateStaticParams() {
  return Object.values(dashboards).flatMap((d) =>
    d.nav.filter((n) => n.slug).map((n) => ({ dashboard: d.id, section: n.slug })),
  );
}

export async function generateMetadata({ params }: PageProps<'/[dashboard]/[section]'>): Promise<Metadata> {
  const { dashboard, section } = await params;
  return { title: findSection(dashboard as DashboardId, section)?.label ?? 'Not found' };
}

export default async function SectionPage({ params }: PageProps<'/[dashboard]/[section]'>) {
  const { dashboard, section } = await params;
  const config = dashboards[dashboard as DashboardId];
  const item = config && findSection(config.id, section);
  if (!config || !item) notFound();
  return <SectionPlaceholder title={item.label} dashboard={config.name} phase={item.phase} />;
}
