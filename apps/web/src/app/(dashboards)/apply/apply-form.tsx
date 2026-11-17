'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, Crosshair, MapPin } from '@phosphor-icons/react';
import { parseCoordinates, type GymLocation } from '@bgym/shared';
import { applyForGym, type ApplyState } from './actions';

const field = 'h-12 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';

export function ApplyForm({ askName }: { askName: boolean }) {
  const [owner, setOwner] = useState({ firstName: '', lastName: '' });
  const [form, setForm] = useState({ name: '', addressText: '', phone: '', description: '' });
  const [location, setLocation] = useState<GymLocation | null>(null);
  const [pasted, setPasted] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [state, setState] = useState<ApplyState>({});
  const [pending, start] = useTransition();
  const err = state.fieldErrors ?? {};

  const useMyLocation = () => {
    if (!navigator.geolocation) return setLocError('This browser can’t share its location. Paste the gym’s coordinates instead.');
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setLocating(false);
      },
      () => {
        setLocError('Couldn’t get your location. Allow location for this site, or paste the coordinates.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const onPaste = (text: string) => {
    setPasted(text);
    const found = parseCoordinates(text);
    setLocation(found);
    setLocError(text && !found ? 'Paste coordinates like 5.6357, -0.1573 or a Google Maps link.' : null);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!location) return setLocError('Set the gym’s location so members nearby can find it.');
        start(async () => setState(await applyForGym({ ...form, description: form.description || undefined, location }, askName ? owner : undefined)));
      }}
      className="flex flex-col gap-4"
    >
      {askName && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="firstName" label="Your first name" error={err.firstName} hint="Owner or manager">
            <input id="firstName" value={owner.firstName} onChange={(e) => setOwner({ ...owner, firstName: e.target.value })} maxLength={30} autoComplete="given-name" autoFocus aria-invalid={!!err.firstName} className={field} />
          </Field>
          <Field id="lastName" label="Last name" error={err.lastName}>
            <input id="lastName" value={owner.lastName} onChange={(e) => setOwner({ ...owner, lastName: e.target.value })} maxLength={30} autoComplete="family-name" aria-invalid={!!err.lastName} className={field} />
          </Field>
        </div>
      )}
      <Field id="name" label="Gym name" error={err.name}>
        <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} autoFocus={!askName} aria-invalid={!!err.name} className={field} />
      </Field>
      <Field id="addressText" label="Area or address" error={err.addressText} hint="E.g. Spintex, Accra">
        <input id="addressText" value={form.addressText} onChange={(e) => setForm({ ...form, addressText: e.target.value })} maxLength={120} aria-invalid={!!err.addressText} className={field} />
      </Field>
      <Field id="phone" label="Gym phone" error={err.phone} hint="Members and the BGYM team call this">
        <input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="024 000 0000" aria-invalid={!!err.phone} className={field} />
      </Field>

      <fieldset className="flex flex-col gap-2 rounded-card border border-line bg-cloud/60 p-4">
        <legend className="px-1 text-sm font-bold">Location on the map</legend>
        <p className="text-sm text-mute">Members search by distance, so pin the gym’s entrance. Easiest if you’re at the gym now.</p>
        <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-midnight px-4 text-sm font-bold text-white hover:bg-indigo disabled:opacity-70">
          {locating ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <Crosshair size={18} weight="bold" aria-hidden />}
          Use my current location
        </button>
        <label htmlFor="coords" className="mt-1 text-sm font-semibold">Or paste coordinates or a Google Maps link</label>
        <input id="coords" value={pasted} onChange={(e) => onPaste(e.target.value)} placeholder="5.6357, -0.1573" className={field} />
        {location && (
          <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-semibold text-success">
            <CheckCircle size={18} weight="fill" aria-hidden /> Pinned at {location.lat}, {location.lng} ·{' '}
            <a href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-flare underline">
              <MapPin size={14} aria-hidden /> check on the map
            </a>
          </p>
        )}
        {(locError || err.location) && <p role="alert" className="text-sm font-semibold text-danger">{locError ?? err.location}</p>}
      </fieldset>

      <Field id="description" label="About the gym (optional)" hint="You can finish this later">
        <textarea id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={600} rows={3} className="w-full rounded-control border border-line bg-white px-3 py-2 outline-none focus:border-flare" />
      </Field>

      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-flare font-bold text-white hover:bg-[#f04e14] disabled:opacity-70">
        {pending && <CircleNotch size={20} className="animate-spin" aria-hidden />}
        Create my gym
      </button>
      <p className="text-center text-xs text-mute">Your gym stays hidden until you finish setting it up and the BGYM team approves it.</p>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold">{label}</label>
        {hint && <span className="text-xs text-mute">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
