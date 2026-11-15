import { DashboardFrame } from '@/components/dashboard-frame';

export default function Layout({ children }: LayoutProps<'/admin'>) {
  return <DashboardFrame dashboard="admin">{children}</DashboardFrame>;
}
