'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { CheckCircle, Circle, CircleNotch, Eye, EyeSlash } from '@phosphor-icons/react';
import type { TrainerMe, TrainerSetupStep } from '@bgym/shared';
import { setTrainerListed } from '@/app/(dashboards)/trainer-actions';

const STEPS: Array<{ step: TrainerSetupStep; label: string; href: string }> = [
  { step: 'profile', label: 'Profile, specialties and price', href: '/trainer/settings#profile' },
  { step: 'photo', label: 'A clear photo of you', href: '/trainer/settings#photo' },
  { step: 'availability', label: 'Your weekly hours', href: '/trainer/availability' },
  { step: 'payout', label: 'Where you get paid', href: '/trainer/settings#payout' },
];

/** Setup checklist, then the switch that shows the trainer in the app. */
export function SetupCard({ me: initial }: { me: TrainerMe }) {
  const [me, setMe] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = me.missing.length === 0;
  const toggle = () =>
    start(async () => {
      const res = await setTrainerListed(!me.listed);
      if (res.data) setMe(res.data);
      setError(res.error ?? null);
    });

  if (me.status === 'suspended') {
    return <div role="alert" className="rounded-card border border-danger/30 bg-danger-50 p-5 font-semibold text-danger">Your profile is paused, so members can’t book you. Contact {me.gym.name} or the BGYM team.</div>;
  }

  return (
    <section className={`rounded-card border p-5 ${me.listed ? 'border-success/30 bg-success-50' : 'border-line bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{me.listed ? 'You’re live in the BGYM app' : ready ? 'Ready to go live' : 'Get set up to take bookings'}</h2>
          <p className="text-sm text-mute">
            {me.listed ? `Members of ${me.gym.name} and nearby can find and book you.` : ready ? 'Everything is set. Turn on your listing when you’re ready for bookings.' : `${4 - me.missing.length} of 4 done.`}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending || (!ready && !me.listed)}
          className={`inline-flex h-11 items-center gap-2 rounded-control px-4 text-sm font-bold disabled:opacity-50 ${me.listed ? 'border-[1.5px] border-line bg-white hover:bg-cloud' : 'bg-flare text-white hover:bg-[#f04e14]'}`}
        >
          {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : me.listed ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          {me.listed ? 'Hide me from the app' : 'Show me in the app'}
        </button>
      </div>
      {!me.listed && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {STEPS.map(({ step, label, href }) => {
            const done = !me.missing.includes(step);
            return (
              <li key={step}>
                <Link href={href} className="flex items-center gap-2.5 rounded-control border border-line bg-white px-3 py-2.5 text-sm font-semibold hover:border-flare">
                  {done ? <CheckCircle size={20} weight="fill" className="text-success" aria-label="Done" /> : <Circle size={20} className="text-mute" aria-label="To do" />}
                  <span className={done ? 'text-mute line-through' : ''}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
