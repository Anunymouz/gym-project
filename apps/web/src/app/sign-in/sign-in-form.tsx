'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleNotch, EnvelopeSimple } from '@phosphor-icons/react';
import { requestCode, verifyCode, type SignInState } from './actions';

export function SignInForm({ next }: { next: string }) {
  const [emailState, sendCode, sending] = useActionState(requestCode, { step: 'email' } as SignInState);
  const [codeState, submitCode, verifying] = useActionState(verifyCode, { step: 'code', email: '' } as SignInState);
  const [editing, setEditing] = useState(false);
  const step = emailState.step === 'code' && !editing ? 'code' : 'email';
  const email = emailState.step === 'code' ? emailState.email : emailState.email ?? '';

  if (step === 'email') {
    return (
      <form action={(fd) => { setEditing(false); sendCode(fd); }} noValidate className="mt-6 flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-bold">Work email</label>
        <div className="relative">
          <EnvelopeSimple size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" aria-hidden />
          <input
            id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={email} required autoFocus
            placeholder="you@yourgym.com"
            aria-invalid={emailState.error ? true : undefined}
            aria-describedby={emailState.error ? 'email-error' : undefined}
            className="h-12 w-full rounded-control border border-line bg-white pr-3 pl-11 font-medium outline-none focus:border-flare"
          />
        </div>
        {emailState.error && <p id="email-error" role="alert" className="text-sm font-semibold text-danger">{emailState.error}</p>}
        <Submit pending={sending} label="Send me a code" />
        <p className="text-center text-xs text-mute">We email you a 6-digit code. No password needed.</p>
      </form>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-mute hover:text-midnight">
        <ArrowLeft size={16} aria-hidden /> Change email
      </button>
      <p className="text-mute">We sent a code to <span className="font-bold text-midnight">{email}</span>.</p>
      <form action={submitCode} noValidate className="flex flex-col gap-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <CodeInput error={codeState.step === 'code' ? codeState.error : undefined} />
        {codeState.step === 'code' && codeState.error && <p id="code-error" role="alert" className="text-sm font-semibold text-danger">{codeState.error}</p>}
        <Submit pending={verifying} label="Sign in" />
      </form>
      <form action={sendCode} className="text-center text-sm text-mute">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="resend" value="1" />
        {emailState.step === 'code' && emailState.resent ? 'New code sent. ' : 'Didn’t get it? '}
        <button type="submit" disabled={sending} className="font-bold text-flare hover:underline disabled:opacity-60">Resend code</button>
      </form>
      {process.env.NODE_ENV === 'development' && <p className="text-center text-xs text-mute">Development: the code is printed in the API terminal.</p>}
    </div>
  );
}

function CodeInput({ error }: { error?: string | undefined }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <>
      <label htmlFor="code" className="text-sm font-bold">6-digit code</label>
      <input
        ref={ref} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
        placeholder="••••••"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'code-error' : undefined}
        className="h-14 w-full rounded-control border border-line bg-white text-center text-2xl font-extrabold tracking-[0.5em] outline-none focus:border-flare"
      />
    </>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending} className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-control bg-flare text-base font-bold text-white transition-colors hover:bg-[#f04e14] disabled:opacity-70">
      {pending && <CircleNotch size={20} className="animate-spin" aria-hidden />}
      {label}
    </button>
  );
}
