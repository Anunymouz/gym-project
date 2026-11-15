import { Suspense, type ReactNode } from 'react';
import { AccountPanel, AccountPanelSkeleton } from '@/components/account-panel';
import { DashboardGate, PageSkeleton } from '@/components/dashboard-gate';
import { DashboardShell } from '@/components/dashboard-shell';
import type { DashboardId } from '@/lib/dashboards';

/**
 * Sidebar, account and access check for one dashboard. The shell renders instantly; anything
 * that needs the session streams in inside <Suspense>.
 */
export function DashboardFrame({ dashboard, children }: { dashboard: DashboardId; children: ReactNode }) {
  return (
    <DashboardShell
      dashboard={dashboard}
      account={
        <Suspense fallback={<AccountPanelSkeleton />}>
          <AccountPanel dashboard={dashboard} />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <DashboardGate dashboard={dashboard}>{children}</DashboardGate>
      </Suspense>
    </DashboardShell>
  );
}
