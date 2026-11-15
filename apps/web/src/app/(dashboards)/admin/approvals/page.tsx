import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/section-placeholder';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('admin', 'approvals') };

export default function Page() {
  return <PlaceholderPage dashboard="admin" slug="approvals" />;
}
