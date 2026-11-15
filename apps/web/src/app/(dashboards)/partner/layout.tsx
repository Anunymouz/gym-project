import { DashboardFrame } from '@/components/dashboard-frame';

export default function Layout({ children }: LayoutProps<'/partner'>) {
  return <DashboardFrame dashboard="partner">{children}</DashboardFrame>;
}
