'use client';

import { useState, useTransition } from 'react';
import { BellRinging, CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { remindMember } from '@/app/(dashboards)/gym-actions';

/**
 * Sends a renewal reminder email. `remindedLabel` (e.g. "Reminded 3h ago") is worked out on
 * the server; when set, the member was reminded in the last 24 hours and the button rests.
 */
export function RemindButton({
  membershipId,
  memberName,
  remindedLabel,
}: {
  membershipId: string;
  memberName: string;
  remindedLabel: string | null;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ done?: boolean; error?: string }>({});

  if (state.done || remindedLabel) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-success">
        <CheckCircle size={16} weight="fill" aria-hidden />{' '}
        {state.done ? 'Reminded just now' : remindedLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        aria-label={`Send ${memberName} a renewal reminder`}
        onClick={() =>
          start(async () => {
            const res = await remindMember(membershipId);
            setState(res.ok ? { done: true } : { error: res.error });
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-flare-50 px-3 text-xs font-bold whitespace-nowrap text-flare transition-colors hover:bg-flare-100 disabled:opacity-60"
      >
        {pending ? (
          <CircleNotch size={14} className="animate-spin" aria-hidden />
        ) : (
          <BellRinging size={14} weight="bold" aria-hidden />
        )}
        Remind
      </button>
      {state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </span>
  );
}
