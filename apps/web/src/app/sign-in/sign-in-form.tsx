'use client';

import { useState, type FormEvent } from 'react';
import { emailSchema } from '@bgym/shared';
import { EnvelopeSimple } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = emailSchema.safeParse(new FormData(e.currentTarget).get('email'));
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setError(null);
    // Phase 1: POST /v1/auth/email/request, then show the 6-digit code step.
    setSent(result.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-bold">
        Work email
      </label>
      <div className="relative">
        <EnvelopeSimple size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute" aria-hidden />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@yourgym.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'email-error' : undefined}
          className="h-12 w-full rounded-control border border-line bg-white pr-3 pl-11 font-medium outline-none focus:border-flare"
        />
      </div>
      {error && (
        <p id="email-error" role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="mt-1 h-12 text-base">
        Send me a code
      </Button>
      <p className="text-center text-xs text-mute" aria-live="polite">
        {sent ? `Preview build: a code would be sent to ${sent}.` : 'We email you a 6-digit code. No password needed.'}
      </p>
    </form>
  );
}
