'use client';

import { useState, useTransition } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import type { ReportTarget } from '@bgym/shared';
import { dismissReport, removeReported } from '@/app/(dashboards)/admin-actions';

const NOUN: Record<ReportTarget, string> = { post: 'post', comment: 'comment', story: 'story' };

export function ReportActions({ reportId, targetType, targetId }: { reportId: string; targetType: ReportTarget; targetId: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ error?: string }>) => start(async () => setError((await fn()).error ?? null));
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => act(() => dismissReport(reportId))} className="h-10 rounded-control border-[1.5px] border-line bg-white px-3.5 text-sm font-bold hover:bg-cloud">Dismiss</button>
        {targetId && (
          <button type="button" disabled={pending} onClick={() => { if (confirm(`Remove this ${NOUN[targetType]} for everyone? All reports on it are closed.`)) act(() => removeReported(targetType, targetId)); }} className="inline-flex h-10 items-center gap-1.5 rounded-control bg-danger px-3.5 text-sm font-bold text-white disabled:opacity-60">
            {pending && <CircleNotch size={16} className="animate-spin" aria-hidden />} Remove {NOUN[targetType]}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
