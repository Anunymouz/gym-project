'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, Copy, Plus, Trash } from '@phosphor-icons/react';
import clsx from 'clsx';
import { GYM_FACILITIES, WEEK_DAYS, WEEK_DAY_LABELS, type GymProfile, type OpeningHours, type UpdateGymProfileInput, type WeekDay } from '@bgym/shared';
import { saveGymProfile, type GymProfileState } from '@/app/(dashboards)/gym-actions';

type Form = { name: string; description: string; phone: string; email: string; addressText: string; facilities: string[]; openingHours: Record<WeekDay, Array<{ open: string; close: string }>> };

function toForm(p: GymProfile): Form {
  const hours = Object.fromEntries(WEEK_DAYS.map((d) => [d, (p.openingHours as OpeningHours)[d] ?? []])) as Form['openingHours'];
  const local = p.phone?.startsWith('+233') ? `0${p.phone.slice(4)}` : (p.phone ?? '');
  return { name: p.name, description: p.description ?? '', phone: local, email: p.email ?? '', addressText: p.addressText, facilities: p.facilities, openingHours: hours };
}

const control = 'h-11 rounded-control border border-line bg-white px-3 outline-none focus:border-flare disabled:bg-cloud disabled:text-mute aria-[invalid=true]:border-danger';
const field = `${control} w-full`;
const timeField = `${control} w-[8.5rem] tabular-nums`;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** A new session starts an hour after the last one ends and runs two hours (within the day). */
function nextSession(last: { close: string } | undefined) {
  const start = Math.min(last ? toMin(last.close) + 60 : 6 * 60, 22 * 60);
  return { open: toTime(start), close: toTime(Math.min(start + 120, 23 * 60 + 55)) };
}

export function GymSettingsForm({ profile, canEdit }: { profile: GymProfile; canEdit: boolean }) {
  // What's saved: the page's profile, or what the last save returned (normalised by the API).
  const [savedProfile, setSavedProfile] = useState(profile);
  const initial = useMemo(() => toForm(savedProfile), [savedProfile]);
  const [form, setForm] = useState<Form>(initial);
  const [state, setState] = useState<GymProfileState>({});
  const [saving, startSaving] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const err = state.fieldErrors ?? {};

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setState({});
  };
  const setDay = (day: WeekDay, sessions: Array<{ open: string; close: string }>) => set('openingHours', { ...form.openingHours, [day]: sessions });

  const save = () =>
    startSaving(async () => {
      const input: UpdateGymProfileInput = { ...form, facilities: form.facilities as UpdateGymProfileInput['facilities'] };
      const result = await saveGymProfile(input);
      if (result.saved) {
        setSavedProfile(result.saved);
        setForm(toForm(result.saved));
      }
      setState(result);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      <fieldset disabled={!canEdit} className="contents">
        <Section title="Profile" description="What members see on your gym’s page in the BGYM app.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="name" label="Gym name" error={err.name}>
              <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={60} aria-invalid={!!err.name} className={field} />
            </Field>
            <Field id="addressText" label="Area or address" error={err.addressText} hint="E.g. East Legon, Accra">
              <input id="addressText" value={form.addressText} onChange={(e) => set('addressText', e.target.value)} maxLength={120} aria-invalid={!!err.addressText} className={field} />
            </Field>
            <Field id="phone" label="Phone" error={err.phone} hint="Shown so members can call you">
              <input id="phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="030 200 0101" aria-invalid={!!err.phone} className={field} />
            </Field>
            <Field id="email" label="Email" error={err.email}>
              <input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@yourgym.com" aria-invalid={!!err.email} className={field} />
            </Field>
            <div className="md:col-span-2">
              <Field id="description" label="About the gym" error={err.description} hint={`${form.description.length}/600`}>
                <textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={600} rows={4} className="w-full rounded-control border border-line bg-white px-3 py-2 outline-none focus:border-flare disabled:bg-cloud" />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          title="Opening hours"
          description="Members see whether you’re open now. Add a second session for a midday break."
          action={
            canEdit && (
              <button type="button" onClick={() => set('openingHours', { ...form.openingHours, ...Object.fromEntries(['tue', 'wed', 'thu', 'fri'].map((d) => [d, form.openingHours.mon])) })} className="inline-flex items-center gap-1.5 text-sm font-bold text-flare hover:underline">
                <Copy size={16} aria-hidden /> Copy Monday to weekdays
              </button>
            )
          }
        >
          <ul className="divide-y divide-line">
            {WEEK_DAYS.map((day) => {
              const sessions = form.openingHours[day];
              const open = sessions.length > 0;
              const dayError = Object.entries(err).find(([k]) => k.startsWith(`openingHours.${day}`))?.[1];
              return (
                <li key={day} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                  <div className="flex w-44 shrink-0 items-center gap-3 pt-1.5">
                    <Toggle checked={open} label={`Open on ${WEEK_DAY_LABELS[day]}`} onChange={(v) => setDay(day, v ? [{ open: '06:00', close: '21:00' }] : [])} />
                    <span className="font-semibold">{WEEK_DAY_LABELS[day]}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    {!open && <p className="pt-1.5 text-mute">Closed</p>}
                    {sessions.map((s, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input type="time" step={300} value={s.open} aria-label={`${WEEK_DAY_LABELS[day]} session ${i + 1} opens`} onChange={(e) => setDay(day, sessions.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} className={timeField} />
                        <span className="text-mute">to</span>
                        <input type="time" step={300} value={s.close} aria-label={`${WEEK_DAY_LABELS[day]} session ${i + 1} closes`} onChange={(e) => setDay(day, sessions.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} className={timeField} />
                        {canEdit && sessions.length > 1 && (
                          <button type="button" onClick={() => setDay(day, sessions.filter((_, j) => j !== i))} aria-label={`Remove ${WEEK_DAY_LABELS[day]} session ${i + 1}`} className="grid size-9 place-items-center rounded-control text-mute hover:bg-cloud hover:text-danger">
                            <Trash size={18} aria-hidden />
                          </button>
                        )}
                      </div>
                    ))}
                    {canEdit && open && sessions.length < 3 && toMin(sessions.at(-1)!.close) < 22 * 60 && (
                      <button type="button" onClick={() => setDay(day, [...sessions, nextSession(sessions.at(-1))])} className="inline-flex items-center gap-1 self-start text-sm font-bold text-mute hover:text-midnight">
                        <Plus size={14} weight="bold" aria-hidden /> Add session
                      </button>
                    )}
                    {dayError && <p className="text-sm font-semibold text-danger">{dayError}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Facilities" description="Members can filter gyms by these in the app.">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Facilities">
            {GYM_FACILITIES.map((f) => {
              const on = form.facilities.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('facilities', on ? form.facilities.filter((x) => x !== f) : [...form.facilities, f])}
                  className={clsx('rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-bold transition-colors disabled:opacity-70', on ? 'border-midnight bg-midnight text-white' : 'border-line bg-white text-mute hover:text-midnight')}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </Section>
      </fieldset>

      {canEdit && (dirty || state.ok || state.error) && (
        <div className="sticky bottom-0 z-20 -mx-4 -mb-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mb-8 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <p role="status" className={clsx('text-sm font-semibold', state.error ? 'text-danger' : state.ok && !dirty ? 'text-success' : 'text-mute')}>
              {state.error ?? (state.ok && !dirty ? (
                <span className="inline-flex items-center gap-1.5"><CheckCircle size={18} weight="fill" aria-hidden /> Saved. Members see the changes now.</span>
              ) : 'You have unsaved changes')}
            </p>
            <div className="flex gap-2">
              {dirty && (
                <button type="button" onClick={() => { setForm(initial); setState({}); }} className="h-10 rounded-control border-[1.5px] border-line px-4 text-sm font-bold hover:bg-cloud">
                  Discard
                </button>
              )}
              <button type="submit" disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60">
                {saving && <CircleNotch size={18} className="animate-spin" aria-hidden />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function Section({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">{title}</h2>
          <p className="text-sm text-mute">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
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

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60', checked ? 'bg-flare' : 'bg-[#D9DCEA]')}
    >
      <span className={clsx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}
