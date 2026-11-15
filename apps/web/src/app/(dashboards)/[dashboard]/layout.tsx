import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AccountPanel, AccountPanelSkeleton } from '@/components/account-panel';
import { DashboardGate, PageSkeleton } from '@/components/dashboard-gate';
import { DashboardShell } from '@/components/dashboard-shell';
import { dashboards, isDashboardId } from '@/lib/dashboards';

export function generateStaticParams() {
  return Object.keys(dashboards).map((dashboard) => ({ dashboard }));
}

/**
 * The shell (sidebar, navigation) renders instantly: it reads the dashboard from the URL in
 * the browser. Everything that needs the session or the URL on the server streams in
 * inside <Suspense>.
 */
export default function DashboardLayout({ children, params }: LayoutProps<'/[dashboard]'>) {
  return (
    <DashboardShell account={<Suspense fallback={<AccountPanelSkeleton />}><Account params={params} /></Suspense>}>
      <Suspense fallback={<PageSkeleton />}>
        <Gate params={params}>{children}</Gate>
      </Suspense>
    </DashboardShell>
  );
}

async function Account({ params }: { params: LayoutProps<'/[dashboard]'>['params'] }) {
  const { dashboard } = await params;
  return isDashboardId(dashboard) ? <AccountPanel dashboard={dashboard} /> : null;
}

async function Gate({ params, children }: { params: LayoutProps<'/[dashboard]'>['params']; children: React.ReactNode }) {
  const { dashboard } = await params;
  if (!isDashboardId(dashboard)) notFound();
  return <DashboardGate dashboard={dashboard}>{children}</DashboardGate>;
}
