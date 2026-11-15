'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ArrowCounterClockwise, CheckCircle, CircleNotch, EyeSlash, FilmStrip, ImageSquare, Plus, Trash, X } from '@phosphor-icons/react';
import { BODY_PARTS, EQUIPMENT, MAX_EXERCISE_VIDEO_SECONDS, type ExerciseInput, type ExerciseItem } from '@bgym/shared';
import { attachExerciseVideo, clearExerciseMedia, saveExercise, setExerciseActive, uploadExercisePhoto } from '@/app/(dashboards)/workout-actions';
import { Badge } from '@/components/ui/badge';
import { mediaSrc } from '@/lib/media';
import { preparePhoto } from '@/lib/prepare-photo';
import { checkVideo, uploadVideo, type VideoProgress } from '@/lib/upload-video';

const field = 'h-11 w-full rounded-control border border-line bg-white px-3 outline-none focus:border-flare aria-[invalid=true]:border-danger';
const area = 'w-full rounded-control border border-line bg-white px-3 py-2 outline-none focus:border-flare aria-[invalid=true]:border-danger';

/** A list of short lines (steps or tips) edited one per row. */
function Lines({ label, hint, items, max, errorKey, errors, onChange, placeholder }: { label: string; hint: string; items: string[]; max: number; errorKey: string; errors: Record<string, string>; onChange: (items: string[]) => void; placeholder: string }) {
  const err = Object.entries(errors).find(([k]) => k === errorKey || k.startsWith(`${errorKey}.`))?.[1];
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-bold">{label}</legend>
      <p className="-mt-1 text-xs text-mute">{hint}</p>
      <ol className="flex flex-col gap-2">
        {items.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right text-sm font-bold text-mute">{i + 1}.</span>
            <textarea rows={1} value={line} maxLength={300} placeholder={placeholder} aria-label={`${label} ${i + 1}`} aria-invalid={!!errors[`${errorKey}.${i}`]} onChange={(e) => onChange(items.map((l, j) => (j === i ? e.target.value : l)))} className={`${area} min-h-11 resize-y`} />
            <button type="button" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full text-mute hover:bg-danger-50 hover:text-danger"><X size={16} aria-hidden /></button>
          </li>
        ))}
      </ol>
      {err && <p className="text-sm font-semibold text-danger">{err}</p>}
      <button type="button" disabled={items.length >= max} onClick={() => onChange([...items, ''])} className="inline-flex h-9 items-center gap-1 self-start rounded-control px-2.5 text-sm font-bold text-flare hover:bg-flare-50 disabled:opacity-40"><Plus size={16} weight="bold" aria-hidden /> Add a line</button>
    </fieldset>
  );
}

/** Create or edit an exercise in the BGYM library, with a demo photo or a short video. */
export function ExerciseEditor({ initial }: { initial: ExerciseItem | null }) {
  const router = useRouter();
  const [exercise, setExercise] = useState(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [bodyPart, setBodyPart] = useState(initial?.bodyPart ?? '');
  const [targetMuscle, setTargetMuscle] = useState(initial?.targetMuscle ?? '');
  const [secondary, setSecondary] = useState(initial?.secondaryMuscles.join(', ') ?? '');
  const [equipment, setEquipment] = useState(initial?.equipment ?? 'None');
  const [instructions, setInstructions] = useState(initial?.instructions.length ? initial.instructions : ['']);
  const [tips, setTips] = useState(initial?.tips ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [pending, start] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imported = !!exercise && exercise.source !== 'bgym';

  const input = (): ExerciseInput => ({
    name,
    bodyPart: bodyPart as ExerciseInput['bodyPart'],
    targetMuscle: targetMuscle || undefined,
    secondaryMuscles: secondary.split(',').map((s) => s.trim()).filter(Boolean),
    equipment: equipment || undefined,
    instructions: instructions.map((l) => l.trim()).filter(Boolean),
    tips: tips.map((l) => l.trim()).filter(Boolean),
  });
  const after = (res: { data?: ExerciseItem; error?: string; fieldErrors?: Record<string, string> }, ok?: string) => {
    setErrors(res.fieldErrors ?? {});
    if (res.data) setExercise(res.data);
    setMessage(res.error ? { error: res.error } : res.fieldErrors ? { error: 'Check the highlighted fields.' } : ok ? { ok } : {});
    return res;
  };

  const save = () =>
    start(async () => {
      const res = after(await saveExercise(exercise?.id ?? null, input()), 'Saved.');
      if (res.data && !exercise) router.replace(`/admin/workouts/exercises/${res.data.id}`);
    });
  const uploadPhoto = (file: File | undefined) =>
    file &&
    start(async () => {
      const form = new FormData();
      form.append('photo', await preparePhoto(file, 1600), 'photo.jpg');
      after(await uploadExercisePhoto(exercise!.id, form), 'Photo added.');
      if (photoInput.current) photoInput.current.value = '';
    });
  const uploadDemo = (file: File | undefined) =>
    file &&
    start(async () => {
      if (videoInput.current) videoInput.current.value = '';
      const problem = await checkVideo(file, 'exercise');
      if (problem) return void setMessage({ error: problem });
      try {
        const videoId = await uploadVideo(file, 'exercise', setProgress);
        after(await attachExerciseVideo(exercise!.id, videoId), 'Video added.');
      } catch (err) {
        setMessage({ error: err instanceof Error ? err.message : 'The upload didn’t go through.' });
      } finally {
        setProgress(null);
      }
    });

  const media = exercise?.media;
  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-5 rounded-card border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">{exercise ? 'Details' : 'New exercise'}</h2>
          <div className="flex gap-2">
            {imported && <Badge tone="info">From {exercise.source}</Badge>}
            {exercise && !exercise.isActive && <Badge tone="neutral">Hidden</Badge>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="name" className="text-sm font-bold">Name</label>
            <input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} placeholder="Goblet squat" className={field} />
            {errors.name && <p className="text-sm font-semibold text-danger">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bodyPart" className="text-sm font-bold">Body part</label>
            <select id="bodyPart" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} aria-invalid={!!errors.bodyPart} className={field}>
              <option value="">Choose…</option>
              {Object.entries(BODY_PARTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              {bodyPart && !(bodyPart in BODY_PARTS) && <option value={bodyPart}>{bodyPart} (imported)</option>}
            </select>
            {errors.bodyPart && <p className="text-sm font-semibold text-danger">Choose a body part.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="equipment" className="text-sm font-bold">Equipment</label>
            <input id="equipment" list="equipment-list" value={equipment} maxLength={40} onChange={(e) => setEquipment(e.target.value)} className={field} />
            <datalist id="equipment-list">{EQUIPMENT.map((e) => <option key={e} value={e} />)}</datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="target" className="text-sm font-bold">Main muscle <span className="font-normal text-mute">(optional)</span></label>
            <input id="target" value={targetMuscle} maxLength={60} onChange={(e) => setTargetMuscle(e.target.value)} placeholder="Quadriceps" className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="secondary" className="text-sm font-bold">Also works <span className="font-normal text-mute">(comma separated)</span></label>
            <input id="secondary" value={secondary} onChange={(e) => setSecondary(e.target.value)} aria-invalid={Object.keys(errors).some((k) => k.startsWith('secondaryMuscles'))} placeholder="Glutes, Core" className={field} />
          </div>
        </div>
        <Lines label="Steps" hint="Short, plain steps a beginner can follow while they move. Up to 10." items={instructions} max={10} errorKey="instructions" errors={errors} onChange={setInstructions} placeholder="Stand with your feet shoulder-width apart." />
        <Lines label="Tips" hint="Common mistakes and easier or harder options. Optional, up to 5." items={tips} max={5} errorKey="tips" errors={errors} onChange={setTips} placeholder="Keep your heels down." />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-control bg-midnight px-5 text-sm font-bold text-white hover:bg-indigo disabled:opacity-60">
            {pending && !progress && <CircleNotch size={18} className="animate-spin" aria-hidden />} {exercise ? 'Save changes' : 'Save and add a demo'}
          </button>
          {message.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> {message.ok}</p>}
          {message.error && <p role="alert" className="text-sm font-semibold text-danger">{message.error}</p>}
        </div>
      </form>

      <div className="grid gap-5 self-start md:grid-cols-2 2xl:grid-cols-1">
        <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
          <div>
            <h2 className="text-lg font-extrabold">Demo</h2>
            <p className="text-sm text-mute">A clear photo of the position, or a video of one or two reps (up to {MAX_EXERCISE_VIDEO_SECONDS} seconds, no sound needed). Film in good light with the whole body in frame.</p>
          </div>
          {!exercise ? (
            <p className="rounded-control bg-cloud p-4 text-sm text-mute">Save the exercise first, then add a demo.</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg bg-cloud">
                {progress ? (
                  <div className="grid aspect-video place-items-center p-4 text-center text-sm font-semibold text-mute">
                    <span className="flex flex-col items-center gap-2">
                      <CircleNotch size={26} className="animate-spin text-flare" aria-hidden />
                      {progress.stage === 'uploading' ? `Uploading… ${Math.round(progress.fraction * 100)}%` : 'Getting the video ready…'}
                    </span>
                  </div>
                ) : media?.type === 'video' ? (
                  <video key={media.url} src={mediaSrc(media.url)} poster={media.thumbUrl ? mediaSrc(media.thumbUrl) : undefined} controls muted loop playsInline preload="metadata" className="aspect-video w-full bg-midnight object-contain" />
                ) : media?.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- server-resized
                  <img src={mediaSrc(media.url)} alt={`${exercise.name} demo`} className="aspect-video w-full object-contain" />
                ) : media?.type === 'animation' ? (
                  <p className="p-4 text-sm text-mute">Uses the animation from {exercise.source}. It shows in the app; <a href={media.url} target="_blank" rel="noopener noreferrer" className="font-bold text-flare underline">open it</a>. Add a photo or video to use BGYM’s own instead.</p>
                ) : (
                  <p className="grid aspect-video place-items-center text-sm text-mute">No demo yet</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => photoInput.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud disabled:opacity-60"><ImageSquare size={18} aria-hidden /> {media?.type === 'image' ? 'Replace photo' : 'Photo'}</button>
                <button type="button" disabled={pending} onClick={() => videoInput.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud disabled:opacity-60"><FilmStrip size={18} aria-hidden /> {media?.type === 'video' ? 'Replace video' : 'Video'}</button>
                {(media?.type === 'image' || media?.type === 'video') && (
                  <button type="button" disabled={pending} onClick={() => { if (confirm('Remove this demo?')) start(async () => { after(await clearExerciseMedia(exercise.id), 'Demo removed.'); }); }} className="inline-flex h-10 items-center gap-2 rounded-control px-3 text-sm font-bold text-danger hover:bg-danger-50"><Trash size={18} aria-hidden /> Remove</button>
                )}
              </div>
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => uploadDemo(e.target.files?.[0])} />
            </>
          )}
        </section>

        {exercise && (
          <section className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
            <h2 className="text-lg font-extrabold">In the library</h2>
            <p className="text-sm text-mute">
              {exercise.usedIn > 0 ? `Used ${exercise.usedIn} time${exercise.usedIn === 1 ? '' : 's'} in workouts. ` : 'Not in any workout yet. '}
              {exercise.isActive ? 'Hidden exercises stay in existing workouts but can’t be added to new ones.' : 'It’s hidden from the workout builder.'}
            </p>
            <button type="button" disabled={pending} onClick={() => start(async () => { after(await setExerciseActive(exercise.id, !exercise.isActive), exercise.isActive ? 'Hidden from the builder.' : 'Back in the builder.'); })} className="inline-flex h-10 items-center gap-2 self-start rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud">
              {exercise.isActive ? <><EyeSlash size={18} aria-hidden /> Hide</> : <><ArrowCounterClockwise size={18} aria-hidden /> Show again</>}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
