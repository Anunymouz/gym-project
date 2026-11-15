'use client';

import { useEffect, useTransition } from 'react';
import { ArrowClockwise, CircleNotch, CloudSlash } from '@phosphor-icons/react';

/**
 * Shown inside the dashboard when a page fails to load, most often because the API is
 * restarting or unreachable. In production the error's details are hidden from the browser,
 * so this stays general; "Try again" re-fetches the page (Next.js retry()).
 */
export function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, start] = useTransition();
  useEffect(() => console.error(error), [error]);

  return (
    <div role="alert" className="grid place-items-center rounded-card border border-line bg-white px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-flare-50 text-flare">
        <CloudSlash size={30} weight="duotone" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-extrabold">This page didn’t load</h1>
      <p className="mt-1 max-w-md text-mute">BGYM may be restarting or your connection dropped. It usually works again within a few seconds.</p>
      <button
        type="button"
        onClick={() => start(() => retry())}
        disabled={pending}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-70"
      >
        {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <ArrowClockwise size={18} weight="bold" aria-hidden />}
        Try again
      </button>
      {error.digest && <p className="mt-3 text-xs text-mute">Reference: {error.digest}</p>}
    </div>
  );
}
