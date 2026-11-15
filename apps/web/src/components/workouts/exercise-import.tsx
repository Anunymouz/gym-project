'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, UploadSimple, X } from '@phosphor-icons/react';
import { importExercises } from '@/app/(dashboards)/workout-actions';

const EXAMPLE = `{
  "source": "exercisedb",
  "exercises": [
    {
      "externalId": "0001",
      "name": "3/4 sit-up",
      "bodyPart": "core",
      "targetMuscle": "Abs",
      "equipment": "None",
      "instructions": ["Lie on your back…", "…"],
      "animationUrl": "https://…/0001.gif"
    }
  ]
}`;

/**
 * Imports exercises from a licensed library's export. Only use content BGYM has a licence for:
 * the source name is kept on each exercise so it can be traced (and removed) later.
 */
export function ExerciseImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('');
  const [result, setResult] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const run = () =>
    start(async () => {
      const res = await importExercises(json);
      if (res.data) {
        setResult({ ok: `Added ${res.data.created}, updated ${res.data.updated}.` });
        setJson('');
        router.refresh();
      } else setResult({ error: res.error });
    });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line bg-white px-4 text-sm font-bold hover:bg-cloud">
        <UploadSimple size={18} aria-hidden /> Import
      </button>
    );
  }
  return (
    <section aria-labelledby="import-title" className="flex w-full flex-col gap-3 rounded-card border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="import-title" className="text-lg font-extrabold">Import from a licensed library</h2>
          <p className="text-sm text-mute">Paste or choose a JSON export (up to 500 exercises). Exercises already imported from the same source are updated, matched by their id. Only import content BGYM has a licence to use.</p>
        </div>
        <button type="button" aria-label="Close import" onClick={() => setOpen(false)} className="grid size-10 shrink-0 place-items-center rounded-full text-mute hover:bg-cloud"><X size={18} aria-hidden /></button>
      </div>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={10} spellCheck={false} placeholder={EXAMPLE} aria-label="Exercises as JSON" className="rounded-control border border-line bg-white px-3 py-2 font-mono text-xs outline-none focus:border-flare" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => file.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-control border-[1.5px] border-line px-3 text-sm font-bold hover:bg-cloud">Choose a file</button>
        <button type="button" disabled={pending || !json.trim()} onClick={run} className="inline-flex h-10 items-center gap-2 rounded-control bg-midnight px-4 text-sm font-bold text-white hover:bg-indigo disabled:opacity-50">
          {pending && <CircleNotch size={16} className="animate-spin" aria-hidden />} Import
        </button>
        {result.ok && <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" aria-hidden /> {result.ok}</p>}
        {result.error && <p role="alert" className="text-sm font-semibold text-danger">{result.error}</p>}
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 2_000_000) return setResult({ error: 'That file is too big: import up to 500 exercises at a time.' });
          void f.text().then(setJson);
          e.target.value = '';
        }}
      />
    </section>
  );
}
