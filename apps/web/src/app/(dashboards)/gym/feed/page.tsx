import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { StaffPost } from '@bgym/shared';
import { PageSkeleton } from '@/components/dashboard-gate';
import { FeedManager } from '@/components/gym/feed-manager';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { canManagePlans, getCurrentGym } from '@/lib/session.server';

export const metadata: Metadata = { title: sectionTitle('gym', 'feed') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Feed />
    </Suspense>
  );
}

async function Feed() {
  const gym = await getCurrentGym();
  if (!gym) return null;
  const posts = await api<StaffPost[]>(`/v1/staff/gyms/${gym.id}/posts`);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Feed" subtitle="News, tips and updates for your members." />
      <FeedManager initial={posts} canPost={canManagePlans(gym)} gymName={gym.name} />
    </div>
  );
}
