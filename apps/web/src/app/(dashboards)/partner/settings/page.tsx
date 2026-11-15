import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/section-placeholder';
import { sectionTitle } from '@/lib/dashboards';

export const metadata: Metadata = { title: sectionTitle('partner', 'settings') };

export default function Page() {
  return <PlaceholderPage dashboard="partner" slug="settings" />;
}
