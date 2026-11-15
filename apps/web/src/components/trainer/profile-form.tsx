'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, Plus, X } from '@phosphor-icons/react';
import { SESSION_DURATIONS, SPECIALTY_SUGGESTIONS, type TrainerMe } from '@bgym/shared';
import { saveTrainerProfile } from '@/app/(dashboards)/trainer-actions';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';

/** What members see on the trainer's profile, and their price. */
export function ProfileForm({ me }: { me: TrainerMe }) {
  const [bio, setBio] = useState(me.bio ?? '');
  const [specialties, setSpecialties] = useState<string[]>(me.specialties);
  const [custom, setCustom] = useState('');
  const [certs, setCerts] = useState<string[]>(me.certifications);
  const [cert, setCert] = useState('');
  const [price, setPrice] = useState(me.sessionPricePesewas ? String(me.sessionPricePesewas / 100) : '');
  const [duration, setDuration] = useState(me.sessionDurationMin);
  const [cancelHours, setCancelHours] = useState(me.cancelHours);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, start] = useTransition();

  const toggle = (s: string) => setSpecialties((l) => (l.includes(s) ? l.filter((x) => x !== s) : l.length < 8 ? [...l, s] : l));
  const submit = () =>
    start(async () => {
      const res = await saveTrainerProfile({ bio, specialties, certifications: certs, sessionPricePesewas: Math.round(Number(price) * 100), sessionDurationMin: duration as 60, cancelHours });
      setErrors(res.fieldErrors ?? {});
      setMessage(res.data ? { ok: true } : { error: res.error });
    });

  return (
    <form id="profile" onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex scroll-mt-6 flex-col gap-5 rounded-card border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-extrabold">Your profile</h2>
        <p className="text-sm text-mute">Members see this in the app before they book you.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-bold">About you</label>
        <textarea id="bio" rows={5} maxLength={800} value={bio} onChange={(e) => setBio(e.target.value)} aria-invalid={!!errors.bio} placeholder="Your experience, how you coach and who you love working with." className="rounded-control border border-line bg-white px-3 py-2.5 outline-none focus:border-flare aria-[invalid=true]:border-danger" />
        <p className="flex justify-between text-xs text-mute"><span className="font-semibold text-danger">{errors.bio}</span>{bio.length}/800</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Specialties <span className="font-normal text-mute">(up to 8)</span></legend>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...SPECIALTY_SUGGESTIONS, ...specialties])].map((s) => {
            const on = specialties.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)} className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${on ? 'border-midnight bg-midnight text-white' : 'border-line bg-white hover:border-flare'}`}>{s}</button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <label htmlFor="custom-specialty" className="sr-only">Another specialty</label>
          <input id="custom-specialty" value={custom} maxLength={40} onChange={(e) => setCustom(e.target.value)} placeholder="Add another…" className={`${field} max-w-60`} />
          <button type="button" disabled={custom.trim().length < 2} onClick={() => { toggle(custom.trim()); setCustom(''); }} className="inline-flex h-11 items-center gap-1 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud disabled:opacity-50"><Plus size={16} aria-hidden /> Add</button>
        </div>
        {errors.specialties && <p className="text-sm font-semibold text-danger">{errors.specialties}</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Certifications <span className="font-normal text-mute">(optional)</span></legend>
        {certs.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {certs.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 py-1 pr-1.5 pl-3 text-sm font-semibold text-violet">
                {c}
                <button type="button" aria-label={`Remove ${c}`} onClick={() => setCerts((l) => l.filter((x) => x !== c))} className="grid size-5 place-items-center rounded-full hover:bg-white"><X size={12} weight="bold" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <label htmlFor="cert" className="sr-only">Certification</label>
          <input id="cert" value={cert} maxLength={100} onChange={(e) => setCert(e.target.value)} placeholder="e.g. NASM Certified Personal Trainer" className={`${field} max-w-96`} />
          <button type="button" disabled={cert.trim().length < 2 || certs.length >= 10} onClick={() => { setCerts((l) => [...new Set([...l, cert.trim()])]); setCert(''); }} className="inline-flex h-11 items-center gap-1 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud disabled:opacity-50"><Plus size={16} aria-hidden /> Add</button>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className="text-sm font-bold">Price per session (GH₵)</label>
          <input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={!!errors.sessionPricePesewas} placeholder="120" className={field} />
          {errors.sessionPricePesewas && <p className="text-sm font-semibold text-danger">{errors.sessionPricePesewas}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="duration" className="text-sm font-bold">Session length</label>
          <select id="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>
            {SESSION_DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cancel" className="text-sm font-bold">Free cancellation until</label>
          <select id="cancel" value={cancelHours} onChange={(e) => setCancelHours(Number(e.target.value))} className={field}>
            {[2, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h} hours before</option>)}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-mute">Clients who cancel in time get their money back (or the session back on their package). Later than that, they don’t.</p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">
          {pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} Save profile
        </button>
        {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> Saved</p>}
        {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
      </div>
    </form>
  );
}
