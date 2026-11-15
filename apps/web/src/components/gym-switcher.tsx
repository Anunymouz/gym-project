'use client';

import { useRef } from 'react';

/** Picks the gym to manage; submits as soon as the choice changes. */
export function GymSwitcher({ gyms, current, action }: { gyms: Array<{ id: string; name: string }>; current: string; action: (form: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action}>
      <label htmlFor="gym-switcher" className="sr-only">Gym</label>
      <select
        id="gym-switcher" name="gymId" defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="w-full rounded-lg bg-white/10 px-2 py-1.5 font-bold text-white outline-none [&>option]:text-midnight"
      >
        {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <noscript><button type="submit" className="mt-1 font-semibold text-white">Switch</button></noscript>
    </form>
  );
}
