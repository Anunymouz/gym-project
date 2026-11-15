'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { ArrowCounterClockwise, ArrowDown, ArrowUp, CheckCircle, CircleNotch, Clock, ImageSquare, MagnifyingGlass, PaperPlaneTilt, Plus, Trash, X } from '@phosphor-icons/react';
import { BODY_PARTS, estimateWorkoutMinutes, WORKOUT_GOALS, WORKOUT_LEVELS, type AdminWorkout, type ExerciseItem, type WorkoutInput } from '@bgym/shared';
import { deleteWorkout, publishWorkout, saveWorkout, uploadWorkoutCover } from '@/app/(dashboards)/workout-actions';
import { Badge } from '@/components/ui/badge';
import { mediaSrc } from '@/lib/media';
import { preparePhoto } from '@/lib/prepare-photo';
import { ExerciseThumb } from './exercise-thumb';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';
const num = 'h-10 w-full rounded-control border border-line bg-white px-2 text-center outline-none focus:border-flare aria-[invalid=true]:border-danger';

type Step = { key: string; exerciseId: string; sets: string; mode: 'reps' | 'time'; amount: string; rest: string; notes: string };
let nextKey = 0;
const keyOf = () => `s${nextKey++}`;
const toStep = (s: AdminWorkout['steps'][number]): Step => ({
  key: keyOf(), exerciseId: s.exercise.id, sets: s.sets ? String(s.sets) : '', mode: s.durationSec ? 'time' : 'reps',
  amount: String(s.durationSec ?? s.reps ?? ''), rest: s.restSec != null ? String(s.restSec) : '', notes: s.notes ?? '',
});
const n = (s: string) => (s.trim() === '' ? null : Number(s));

/** Build a workout from the exercise library: details, the steps in order, a cover, then publish. */
export function WorkoutBuilder({ initial, library }: { initial: AdminWorkout | null; library: ExerciseItem[] }) {
  const router = useRouter();
  const [workout, setWorkout] = useState(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [level, setLevel] = useState<string>(initial?.level ?? 'beginner');
  const [goal, setGoal] = useState<string>(initial?.goal ?? 'strength');
  const [isFree, setIsFree] = useState(initial?.isFree ?? false);
  const [steps, setSteps] = useState<Step[]>(initial?.steps.map(toStep) ?? []);
  const [search, setSearch] = useState('');
  const [part, setPart] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const coverInput = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((e) => e.isActive && (!part || e.bodyPart === part) && (!q || e.name.toLowerCase().includes(q) || e.targetMuscle?.toLowerCase().includes(q))).slice(0, 40);
  }, [library, search, part]);

  const input = (): WorkoutInput => ({
    title,
    description: description || undefined,
    level: level as WorkoutInput['level'],
    goal: goal as WorkoutInput['goal'],
    isFree,
    steps: steps.map((s) => ({
      exerciseId: s.exerciseId, sets: n(s.sets), reps: s.mode === 'reps' ? n(s.amount) : null, durationSec: s.mode === 'time' ? n(s.amount) : null, restSec: n(s.rest), notes: s.notes || undefined,
    })),
  });
  const minutes = estimateWorkoutMinutes(input().steps);

  const update = (key: string, patch: Partial<Step>) => setSteps((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((l) => {
      const out = [...l];
      const [s] = out.splice(i, 1);
      out.splice(i + by, 0, s!);
      return out;
    });
  const add = (e: ExerciseItem) => {
    const timed = e.bodyPart === 'cardio' || /plank|hold|stretch/i.test(e.name);
    setSteps((l) => [...l, { key: keyOf(), exerciseId: e.id, sets: '3', mode: timed ? 'time' : 'reps', amount: timed ? '30' : '10', rest: '45', notes: '' }]);
  };
  const after = (res: { data?: AdminWorkout; error?: string; fieldErrors?: Record<string, string> }, ok?: string) => {
    setErrors(res.fieldErrors ?? {});
    if (res.data) setWorkout(res.data);
    setMessage(res.error ? { error: res.error } : res.fieldErrors ? { error: res.fieldErrors.steps ?? Object.entries(res.fieldErrors).find(([k]) => k.startsWith('steps.'))?.[1] ?? 'Check the highlighted fields.' } : ok ? { ok } : {});
    return res;
  };

  const save = () =>
    start(async () => {
      const res = after(await saveWorkout(workout?.id ?? null, input()), 'Saved.');
      if (res.data && !workout) router.replace(`/admin/workouts/${res.data.id}`);
    });
  const publish = (isPublished: boolean) =>
    start(async () => {
      after(await publishWorkout(workout!.id, isPublished), isPublished ? 'Published: members can see it now.' : 'Taken out of the app.');
    });
  const cover = (file: File | undefined) =>
    file &&
    start(async () => {
      const form = new FormData();
      form.append('photo', await preparePhoto(file, 1600), 'photo.jpg');
      after(await uploadWorkoutCover(workout!.id, form), 'Cover updated.');
      if (coverInput.current) coverInput.current.value = '';
    });
  const remove = () =>
    confirm('Delete this draft workout?') &&
    start(async () => {
      const res = await deleteWorkout(workout!.id);
      if (res.error) setMessage({ error: res.error });
      else router.replace('/admin/workouts');
    });

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex min-w-0 flex-col gap-5 rounded-card border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">{workout ? 'Details' : 'New workout'}</h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-mute"><Clock size={16} aria-hidden /> About {minutes} min</span>
            {workout && <Badge tone={workout.isPublished ? 'success' : 'neutral'}>{workout.isPublished ? 'Published' : 'Draft'}</Badge>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="title" className="text-sm font-bold">Name</label>
            <input id="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} placeholder="Full-Body Dumbbell Strength" className={field} />
            {errors.title && <p className="text-sm font-semibold text-danger">{errors.title}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="description" className="text-sm font-bold">What it’s for</label>
            <textarea id="description" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who it suits, what they need, how it should feel." className="rounded-control border border-line bg-white px-3 py-2.5 outline-none focus:border-flare" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="level" className="text-sm font-bold">Level</label>
            <select id="level" value={level} onChange={(e) => setLevel(e.target.value)} className={field}>{Object.entries(WORKOUT_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="goal" className="text-sm font-bold">Goal</label>
            <select id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} className={field}>{Object.entries(WORKOUT_GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <label className="flex items-start gap-3 rounded-control bg-cloud p-3 sm:col-span-2">
            <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="mt-0.5 size-5 accent-flare" />
            <span className="text-sm"><span className="font-bold">Free for everyone.</span> <span className="text-mute">Otherwise members unlock it by joining any gym on BGYM. Keep a few good free ones so new members can try it out.</span></span>
          </label>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Exercises, in order</legend>
          <p className="-mt-1 text-xs text-mute">Each exercise is either reps or a time per set. Rest is after each set.</p>
          {steps.length === 0 ? (
            <p className="rounded-control bg-cloud p-4 text-sm text-mute">Add exercises from the library{' '}<span className="2xl:hidden">below</span><span className="hidden 2xl:inline">on the right</span>.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => {
                const ex = byId.get(s.exerciseId);
                const bad = (f: string) => !!errors[`steps.${i}.${f}`] || !!errors[`steps.${i}`];
                return (
                  <li key={s.key} className="flex flex-col gap-2 rounded-control border border-line p-3">
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-right text-sm font-extrabold text-mute">{i + 1}</span>
                      <ExerciseThumb media={ex?.media} className="size-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{ex?.name ?? 'Exercise'}</p>
                        <p className="truncate text-xs text-mute">{[BODY_PARTS[ex?.bodyPart as keyof typeof BODY_PARTS] ?? ex?.bodyPart, ex?.equipment].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="flex shrink-0">
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-full text-mute hover:bg-cloud disabled:opacity-30"><ArrowUp size={16} aria-hidden /></button>
                        <button type="button" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-full text-mute hover:bg-cloud disabled:opacity-30"><ArrowDown size={16} aria-hidden /></button>
                        <button type="button" aria-label="Remove" onClick={() => setSteps((l) => l.filter((x) => x.key !== s.key))} className="grid size-9 place-items-center rounded-full text-mute hover:bg-danger-50 hover:text-danger"><X size={16} aria-hidden /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0 sm:grid-cols-[5rem_auto_6rem_6rem_minmax(0,1fr)] sm:items-end">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-mute">Sets<input inputMode="numeric" value={s.sets} onChange={(e) => update(s.key, { sets: e.target.value.replace(/\D/g, '') })} aria-invalid={bad('sets')} className={num} /></label>
                      <div className="flex flex-col gap-1 text-xs font-semibold text-mute">
                        <span>Per set</span>
                        <div role="radiogroup" aria-label="Reps or time" className="flex h-10 rounded-control bg-cloud p-1">
                          {(['reps', 'time'] as const).map((m) => (
                            <button key={m} type="button" role="radio" aria-checked={s.mode === m} onClick={() => update(s.key, { mode: m })} className={`rounded-[8px] px-3 text-xs font-bold ${s.mode === m ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>{m === 'reps' ? 'Reps' : 'Time'}</button>
                          ))}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-mute">{s.mode === 'reps' ? 'Reps' : 'Seconds'}<input inputMode="numeric" value={s.amount} onChange={(e) => update(s.key, { amount: e.target.value.replace(/\D/g, '') })} aria-invalid={bad(s.mode === 'reps' ? 'reps' : 'durationSec')} className={num} /></label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-mute">Rest (s)<input inputMode="numeric" value={s.rest} onChange={(e) => update(s.key, { rest: e.target.value.replace(/\D/g, '') })} aria-invalid={bad('restSec')} className={num} /></label>
                      <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-mute sm:col-span-1">Note <input value={s.notes} maxLength={200} placeholder="e.g. Each side" onChange={(e) => update(s.key, { notes: e.target.value })} className="h-10 w-full rounded-control border border-line bg-white px-2 text-sm text-ink outline-none focus:border-flare" /></label>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control bg-midnight px-5 text-sm font-bold text-white hover:bg-indigo disabled:opacity-60">
            {pending && <CircleNotch size={18} className="animate-spin" aria-hidden />} {workout ? 'Save changes' : 'Save draft'}
          </button>
          {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> {message.ok}</p>}
          {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
        </div>
        {workout?.isPublished && <p className="-mt-2 text-xs text-mute">Changes show in the app as soon as you save. Members’ history keeps what they did.</p>}
      </form>

      <div className="grid gap-5 self-start md:grid-cols-2 2xl:grid-cols-1">
        <section aria-labelledby="library" className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-white p-5 md:col-span-2 2xl:col-span-1">
          <h2 id="library" className="text-lg font-extrabold">Add from the library</h2>
          <div className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search exercises</span>
              <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={`${field} pl-9`} />
            </label>
            <select aria-label="Body part" value={part} onChange={(e) => setPart(e.target.value)} className="h-11 rounded-control border border-line bg-white px-2 outline-none focus:border-flare">
              <option value="">All</option>
              {Object.entries(BODY_PARTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
            {matches.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => add(e)} className="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-cloud">
                  <ExerciseThumb media={e.media} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{e.name}</span>
                    <span className="block truncate text-xs text-mute">{[BODY_PARTS[e.bodyPart as keyof typeof BODY_PARTS] ?? e.bodyPart, e.equipment].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Plus size={18} weight="bold" className="shrink-0 text-flare" aria-label="Add" />
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="p-3 text-sm text-mute">No exercises match.</li>}
          </ul>
        </section>

        {workout && (
          <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
            <h2 className="text-lg font-extrabold">Cover</h2>
            <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-cloud">
              {workout.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- server-resized
                <img src={mediaSrc(workout.coverUrl)} alt="" className="size-full object-cover" />
              ) : (
                <p className="grid size-full place-items-center text-sm text-mute">No cover yet</p>
              )}
            </div>
            <button type="button" disabled={pending} onClick={() => coverInput.current?.click()} className="inline-flex h-10 items-center gap-2 self-start rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud disabled:opacity-60"><ImageSquare size={18} aria-hidden /> {workout.coverUrl ? 'Replace' : 'Add a cover'}</button>
            <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => cover(e.target.files?.[0])} />
          </section>
        )}

        {workout && (
          <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
            <h2 className="text-lg font-extrabold">In the app</h2>
            <p className="text-sm text-mute">
              {workout.isPublished ? `Members can see it${workout.isFree ? ' for free' : ' once they join a gym'}.` : 'A draft: only the BGYM team can see it.'}
              {workout.sessions > 0 && ` Done ${workout.sessions} time${workout.sessions === 1 ? '' : 's'}.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {workout.isPublished ? (
                <button type="button" disabled={pending} onClick={() => publish(false)} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line px-4 text-sm font-bold hover:bg-cloud"><ArrowCounterClockwise size={18} aria-hidden /> Unpublish</button>
              ) : (
                <button type="button" disabled={pending} onClick={() => publish(true)} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-60"><PaperPlaneTilt size={18} aria-hidden /> Publish</button>
              )}
              {!workout.isPublished && workout.sessions === 0 && (
                <button type="button" disabled={pending} onClick={remove} className="inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-50"><Trash size={18} aria-hidden /> Delete</button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
