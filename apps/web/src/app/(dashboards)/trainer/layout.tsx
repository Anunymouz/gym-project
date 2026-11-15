import { DashboardFrame } from '@/components/dashboard-frame';

export default function Layout({ children }: LayoutProps<'/trainer'>) {
  return <DashboardFrame dashboard="trainer">{children}</DashboardFrame>;
}
