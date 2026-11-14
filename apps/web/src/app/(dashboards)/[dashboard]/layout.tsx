import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { dashboards, isDashboardId } from '@/lib/dashboards';

export function generateStaticParams() {
  return Object.keys(dashboards).map((dashboard) => ({ dashboard }));
}

export default async function DashboardLayout({ children, params }: LayoutProps<'/[dashboard]'>) {
  const { dashboard } = await params;
  if (!isDashboardId(dashboard)) notFound();
  return <DashboardShell config={dashboards[dashboard]}>{children}</DashboardShell>;
}
