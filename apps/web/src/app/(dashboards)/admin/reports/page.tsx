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

const LABEL = { post: 'Post', comment: 'Comment', story: 'Story' } as const;

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
      <PageHeader title="Reports" subtitle={reports.length ? `${reports.length} open · oldest first` : 'Posts, comments and stories members report appear here.'} />
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
                <p className="text-sm text-mute">Reported by {r.reporter} · {formatDateTime(r.createdAt)}{r.target && r.target.reportCount > 1 ? ` · ${r.target.reportCount} open reports on this ${r.targetType}` : ''}</p>
                {r.details && <p className="mt-1 text-sm">“{r.details}”</p>}
              </div>
              <ReportActions reportId={r.id} targetType={r.targetType} targetId={r.target?.status === 'removed' ? null : (r.target?.id ?? null)} />
            </div>
            {r.target ? (
              <div className="mt-4 rounded-control bg-cloud p-4">
                <p className="text-sm"><span className="font-bold">{LABEL[r.targetType]}</span> by {r.target.author} · {r.target.gymName}</p>
                {r.target.body && <p className="mt-1 text-sm whitespace-pre-wrap">{r.target.body}</p>}
                {r.target.thumbs.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {r.target.thumbs.map((t) => (
                      // eslint-disable-next-line @next/next/no-img-element -- server-resized thumbnail
                      <img key={t} src={mediaSrc(t)} alt="" className="size-20 rounded-lg object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-mute">This {r.targetType} has already been deleted.</p>
            )}
          </article>
        ))
      )}
    </div>
  );
}
