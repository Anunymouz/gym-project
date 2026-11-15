'use client';

import { DashboardError } from '@/components/dashboard-error';

/** Fallback for failures in a dashboard's frame (layout), shown full page. */
export default function Error(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-lg">
        <DashboardError {...props} />
      </div>
    </main>
  );
}
