import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Confetti, Flag } from '@phosphor-icons/react/ssr';
import { REPORT_REASONS, type AdminReport } from '@bgym/shared';
import { ReportActions } from '@/components/admin/report-actions';
import { PageSkeleton } from '@/components/dashboard-gate';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api.server';
import { sectionTitle } from '@/lib/dashboards';
import { formatDateTime } from '@/lib/format';
import { mediaSrc } from '@/lib/media';

export const metadata: Metadata = { title: sectionTitle('admin', 'reports') };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  const reports = await api<AdminReport[]>('/v1/admin/reports');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" subtitle={reports.length ? `${reports.length} open · oldest first` : 'Posts members report appear here.'} />
      {reports.length === 0 ? (
        <div className="grid place-items-center rounded-card border border-line bg-white px-6 py-14 text-center">
          <Confetti size={36} weight="duotone" className="text-violet" aria-hidden />
          <p className="mt-3 font-bold">No open reports</p>
        </div>
      ) : (
        reports.map((r) => (
          <article key={r.id} className="rounded-card border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1.5 font-bold text-danger"><Flag size={18} weight="fill" aria-hidden /> {REPORT_REASONS[r.reason]}</p>
                <p className="text-sm text-mute">Reported by {r.reporter} · {formatDateTime(r.createdAt)}{r.post && r.post.reportCount > 1 ? ` · ${r.post.reportCount} open reports on this post` : ''}</p>
                {r.details && <p className="mt-1 text-sm">“{r.details}”</p>}
              </div>
              <ReportActions reportId={r.id} postId={r.post?.status === 'removed' ? null : (r.post?.id ?? null)} />
            </div>
            {r.post ? (
              <div className="mt-4 rounded-control bg-cloud p-4">
                <p className="text-sm font-bold">{r.post.gymName}</p>
                {r.post.body && <p className="mt-1 text-sm whitespace-pre-wrap">{r.post.body}</p>}
                {r.post.thumbs.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {r.post.thumbs.map((t) => (
                      // eslint-disable-next-line @next/next/no-img-element -- server-resized thumbnail
                      <img key={t} src={mediaSrc(t)} alt="" className="size-20 rounded-lg object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-mute">The post has been deleted by the gym.</p>
            )}
          </article>
        ))
      )}
    </div>
  );
}
