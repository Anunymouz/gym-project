'use client';

import { useState, useTransition } from 'react';
import { CalendarX, CheckCircle, CircleNotch, Plus, Trash, X } from '@phosphor-icons/react';
import { WEEKDAYS, type AvailabilityRule, type TrainerAvailability } from '@bgym/shared';
import { addTimeOff, removeTimeOff, saveAvailability } from '@/app/(dashboards)/trainer-actions';
import { formatDate } from '@/lib/format';

// Monday first, like most calendars in Ghana.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const input = 'h-10 rounded-control border border-line bg-white px-2 tabular-nums outline-none focus:border-flare';

/** Weekly hours (several blocks per day) and days off. Times are Accra time. */
export function AvailabilityEditor({ initial }: { initial: TrainerAvailability }) {
  const [rules, setRules] = useState<AvailabilityRule[]>(initial.rules);
  const [timeOff, setTimeOff] = useState(initial.timeOff);
  const [off, setOff] = useState({ date: '', whole: true, startTime: '12:00', endTime: '14:00' });
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [saving, startSaving] = useTransition();
  const [busy, startBusy] = useTransition();

  const update = (i: number, patch: Partial<AvailabilityRule>) => setRules((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (weekday: number) => {
    const last = rules.filter((r) => r.weekday === weekday).at(-1);
    setRules((l) => [...l, last ? { weekday, startTime: last.endTime < '18:00' ? '17:00' : '19:00', endTime: last.endTime < '18:00' ? '20:00' : '21:00' } : { weekday, startTime: '06:00', endTime: '10:00' }]);
  };
  const copyMonday = () => {
    const monday = rules.filter((r) => r.weekday === 1);
    setRules((l) => [...l.filter((r) => r.weekday === 0 || r.weekday === 6 || r.weekday === 1), ...[2, 3, 4, 5].flatMap((weekday) => monday.map((r) => ({ ...r, weekday })))]);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="rounded-card border border-line bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold">Weekly hours</h2>
            <p className="text-sm text-mute">When members can book you, in Accra time. Sessions start every 30 minutes inside these hours.</p>
          </div>
          <button type="button" onClick={copyMonday} disabled={!rules.some((r) => r.weekday === 1)} className="h-9 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud disabled:opacity-50">Copy Monday to weekdays</button>
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {ORDER.map((weekday) => {
            const day = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === weekday);
            return (
              <li key={weekday} className="flex flex-wrap items-start gap-3 py-3">
                <p className="w-24 pt-2 font-bold">{WEEKDAYS[weekday]}</p>
                <div className="flex flex-1 flex-col gap-2">
                  {day.length === 0 && <p className="pt-2 text-sm text-mute">Not available</p>}
                  {day.map(({ r, i }) => (
                    <div key={i} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`s${i}`}>{WEEKDAYS[weekday]} from</label>
                      <input id={`s${i}`} type="time" step={1800} value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} className={input} />
                      <span className="text-mute">to</span>
                      <label className="sr-only" htmlFor={`e${i}`}>{WEEKDAYS[weekday]} until</label>
                      <input id={`e${i}`} type="time" step={1800} value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} className={input} />
                      <button type="button" aria-label="Remove these hours" onClick={() => setRules((l) => l.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-full text-mute hover:bg-danger-50 hover:text-danger"><X size={16} aria-hidden /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => add(weekday)} aria-label={`Add hours on ${WEEKDAYS[weekday]}`} className="inline-flex h-9 items-center gap-1 rounded-control px-2.5 text-sm font-bold text-flare hover:bg-flare-50"><Plus size={16} weight="bold" aria-hidden /> Hours</button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => startSaving(async () => { const res = await saveAvailability({ rules }); if (res.data) setRules(res.data.rules); setMessage(res.error ? { error: res.error } : { ok: 'Hours saved.' }); })}
            className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60"
          >
            {saving && <CircleNotch size={18} className="animate-spin" aria-hidden />} Save hours
          </button>
          {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> {message.ok}</p>}
          {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
        </div>
        <p className="mt-2 text-xs text-mute">Changing your hours doesn’t cancel sessions already booked.</p>
      </section>

      <section className="self-start rounded-card border border-line bg-white p-5">
        <h2 className="text-lg font-extrabold">Time off</h2>
        <p className="text-sm text-mute">Days (or part of a day) you can’t train anyone. Cancel any sessions already booked from Bookings.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startBusy(async () => {
              const res = await addTimeOff(off.whole ? { date: off.date } : { date: off.date, startTime: off.startTime, endTime: off.endTime });
              if (res.data) setTimeOff(res.data.timeOff);
              setMessage(res.error ? { error: res.error } : {});
            });
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="off-date" className="text-sm font-bold">Date</label>
              <input id="off-date" type="date" required min={new Date().toISOString().slice(0, 10)} value={off.date} onChange={(e) => setOff({ ...off, date: e.target.value })} className={input} />
            </div>
            <label className="inline-flex h-10 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={off.whole} onChange={(e) => setOff({ ...off, whole: e.target.checked })} className="size-4 accent-flare" /> Whole day
            </label>
          </div>
          {!off.whole && (
            <div className="flex items-center gap-2">
              <input aria-label="From" type="time" step={1800} value={off.startTime} onChange={(e) => setOff({ ...off, startTime: e.target.value })} className={input} />
              <span className="text-mute">to</span>
              <input aria-label="Until" type="time" step={1800} value={off.endTime} onChange={(e) => setOff({ ...off, endTime: e.target.value })} className={input} />
            </div>
          )}
          <button type="submit" disabled={busy || !off.date} className="inline-flex h-10 items-center gap-2 self-start rounded-control bg-midnight px-4 text-sm font-bold text-white disabled:opacity-50"><CalendarX size={18} aria-hidden /> Add time off</button>
        </form>
        <ul className="mt-4 flex flex-col gap-2">
          {timeOff.length === 0 && <li className="text-sm text-mute">No time off planned.</li>}
          {timeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 rounded-control bg-cloud px-3 py-2 text-sm">
              <span><span className="font-bold">{formatDate(`${t.date}T12:00:00Z`)}</span> · {t.startTime ? `${t.startTime}–${t.endTime}` : 'All day'}</span>
              <button type="button" aria-label="Remove time off" disabled={busy} onClick={() => startBusy(async () => { const res = await removeTimeOff(t.id); if (res.data) setTimeOff(res.data.timeOff); })} className="grid size-8 place-items-center rounded-full text-mute hover:bg-white hover:text-danger"><Trash size={16} aria-hidden /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
