'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera, CircleNotch, UserCircle } from '@phosphor-icons/react';
import { uploadTrainerPhoto } from '@/app/(dashboards)/trainer-actions';
import { mediaSrc } from '@/lib/media';
import { preparePhoto } from '@/lib/prepare-photo';

/** The trainer's photo: the first thing members see. */
export function PhotoCard({ photoUrl: initial, name }: { photoUrl: string | null; name: string | null }) {
  const [url, setUrl] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const upload = (file?: File) => {
    if (!file) return;
    start(async () => {
      try {
        const form = new FormData();
        form.append('photo', await preparePhoto(file, 1600), 'photo.jpg');
        const res = await uploadTrainerPhoto(form);
        if (res.data) setUrl(res.data.photoUrl);
        setError(res.error ?? null);
      } catch {
        setError('That file isn’t a photo we can use.');
      }
      if (input.current) input.current.value = '';
    });
  };
  return (
    <section id="photo" className="flex scroll-mt-6 flex-wrap items-center gap-5 rounded-card border border-line bg-white p-5">
      <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-full bg-cloud text-mute">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
        {url ? <img src={mediaSrc(url)} alt={name ?? 'Your photo'} className="size-full object-cover" /> : <UserCircle size={64} weight="thin" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-extrabold">Your photo</h2>
        <p className="text-sm text-mute">A clear, friendly photo of your face, ideally at the gym. Members book trainers they can picture.</p>
        {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <button type="button" disabled={pending} onClick={() => input.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-control bg-midnight px-4 text-sm font-bold text-white hover:bg-indigo disabled:opacity-60">
        {pending ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <Camera size={18} aria-hidden />} {url ? 'Change photo' : 'Upload photo'}
      </button>
    </section>
  );
}
