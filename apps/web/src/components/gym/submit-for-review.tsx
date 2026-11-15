'use client';

import { useState, useTransition } from 'react';
import { CircleNotch, PaperPlaneTilt } from '@phosphor-icons/react';
import { submitGymForReview } from '@/app/(dashboards)/gym-actions';

export function SubmitForReview({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => start(async () => setError((await submitGymForReview()).error ?? null))}
        title={disabled ? 'Finish the checklist first' : undefined}
        className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <PaperPlaneTilt size={18} weight="bold" aria-hidden />}
        Send for review
      </button>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
