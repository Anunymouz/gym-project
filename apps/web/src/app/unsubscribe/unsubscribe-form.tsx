'use client';

import { useActionState } from 'react';
import { CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { unsubscribe, type UnsubscribeState } from './actions';

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unsubscribe, {} as UnsubscribeState);

  if (state.done) {
    return (
      <div role="status" className="mt-4 flex flex-col items-center gap-2 text-center">
        <CheckCircle size={48} weight="fill" className="text-success" aria-hidden />
        <h1 className="text-2xl font-extrabold">You’re unsubscribed</h1>
        <p className="text-mute">We won’t email you about {state.done.label.toLowerCase()} any more. You can turn it back on in the BGYM app under Me → Notifications.</p>
      </div>
    );
  }
  return (
    // A button, not an automatic change on page load: email scanners open links, people press buttons.
    <form action={action} className="flex flex-col gap-3">
      <h1 className="mt-4 text-center text-2xl font-extrabold">Stop these emails?</h1>
      <p className="mb-3 text-center text-mute">You’ll stop getting this kind of email from BGYM. Notifications on your phone aren’t affected.</p>
      <input type="hidden" name="t" value={token} />
      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-midnight font-bold text-white hover:bg-indigo disabled:opacity-70">
        {pending && <CircleNotch size={20} className="animate-spin" aria-hidden />}
        Stop these emails
      </button>
      <p className="text-center text-xs text-mute">Sign-in codes and payment receipts are always sent.</p>
    </form>
  );
}
