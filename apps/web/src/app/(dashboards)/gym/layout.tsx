import { DashboardFrame } from '@/components/dashboard-frame';

export default function Layout({ children }: LayoutProps<'/gym'>) {
  return <DashboardFrame dashboard="gym">{children}</DashboardFrame>;
}
