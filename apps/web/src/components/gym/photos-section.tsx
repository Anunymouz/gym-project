'use client';

import { useRef, useState, useTransition } from 'react';
import { CheckCircle, CircleNotch, ImageSquare, Star, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { MAX_GYM_PHOTOS, MAX_PHOTO_BYTES, MIN_PHOTO_LONG_SIDE, type GymPhotoItem } from '@bgym/shared';
import { deleteGymPhoto, makeCoverPhoto, uploadGymPhoto } from '@/app/(dashboards)/gym-actions';
import { mediaSrc } from '@/lib/media';

type Upload = { name: string; state: 'preparing' | 'uploading' | 'done' | 'error'; message?: string };

/**
 * Big phone photos are shrunk in the browser first (to 2400 px, JPEG): uploads are faster on
 * mobile data. The server still checks and re-encodes everything.
 */
async function prepare(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the photo's rotation
  } catch {
    throw new Error('This browser can’t read that file. Use a JPEG or PNG photo.');
  }
  const long = Math.max(bitmap.width, bitmap.height);
  if (long < MIN_PHOTO_LONG_SIDE) throw new Error(`Too small: use a photo at least ${MIN_PHOTO_LONG_SIDE} pixels wide.`);
  if (file.size <= 2.5 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/webp')) return file;
  const scale = Math.min(1, 2400 / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Couldn’t prepare that photo.');
  return blob;
}

export function PhotosSection({ initial, canEdit }: { initial: GymPhotoItem[]; canEdit: boolean }) {
  const [photos, setPhotos] = useState(initial);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const room = MAX_GYM_PHOTOS - photos.length;

  const addFiles = async (files: File[]) => {
    setError(null);
    const batch = files.slice(0, room);
    if (files.length > room) setError(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (${MAX_GYM_PHOTOS} at most).`);
    setUploads(batch.map((f) => ({ name: f.name, state: 'preparing' })));
    setBusy(true);
    const update = (i: number, u: Partial<Upload>) => setUploads((list) => list.map((x, j) => (j === i ? { ...x, ...u } : x)));
    // One at a time: steady progress, and a failure only affects its own photo.
    for (const [i, file] of batch.entries()) {
      try {
        if (file.size > 40 * 1024 * 1024) throw new Error('That file is too big.');
        const blob = await prepare(file);
        if (blob.size > MAX_PHOTO_BYTES) throw new Error('That photo is over 10 MB, even after shrinking.');
        update(i, { state: 'uploading' });
        const form = new FormData();
        form.set('photo', blob, 'photo.jpg');
        const res = await uploadGymPhoto(form);
        if (res.error) throw new Error(res.error);
        setPhotos(res.photos!);
        update(i, { state: 'done' });
      } catch (err) {
        update(i, { state: 'error', message: err instanceof Error ? err.message : 'Upload failed.' });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  const act = (fn: () => Promise<{ photos?: GymPhotoItem[]; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setError(res.error ?? null);
      if (res.photos) setPhotos(res.photos);
    });

  return (
    <section id="photos" className="scroll-mt-6 rounded-card border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Photos</h2>
          <p className="text-sm text-mute">Show members your gym floor, equipment and changing rooms. The first photo is your cover in the app. Up to {MAX_GYM_PHOTOS}.</p>
        </div>
        {canEdit && (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addFiles([...(e.target.files ?? [])])} />
            <button type="button" disabled={busy || room <= 0} onClick={() => input.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-4 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-50">
              {busy ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <UploadSimple size={18} weight="bold" aria-hidden />}
              Add photos
            </button>
          </>
        )}
      </div>

      {uploads.length > 0 && (
        <ul aria-live="polite" className="mb-4 flex flex-col gap-1.5 rounded-control bg-cloud p-3 text-sm">
          {uploads.map((u, i) => (
            <li key={i} className="flex items-center gap-2">
              {u.state === 'done' ? <CheckCircle size={18} weight="fill" className="text-success" aria-hidden /> : u.state === 'error' ? <WarningCircle size={18} weight="fill" className="text-danger" aria-hidden /> : <CircleNotch size={18} className="animate-spin text-mute" aria-hidden />}
              <span className="min-w-0 truncate font-semibold">{u.name}</span>
              <span className={u.state === 'error' ? 'text-danger' : 'text-mute'}>
                {u.state === 'preparing' ? 'Preparing…' : u.state === 'uploading' ? 'Uploading…' : u.state === 'done' ? 'Added' : u.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mb-3 text-sm font-semibold text-danger">{error}</p>}

      {photos.length === 0 ? (
        <button type="button" disabled={!canEdit} onClick={() => input.current?.click()} className="grid w-full place-items-center rounded-card border-2 border-dashed border-[#C9CDE0] px-6 py-12 text-center hover:bg-cloud disabled:hover:bg-transparent">
          <ImageSquare size={40} weight="duotone" className="text-violet" aria-hidden />
          <span className="mt-2 font-bold">No photos yet</span>
          <span className="text-sm text-mute">{canEdit ? 'Add a few bright, wide shots. Landscape photos look best.' : 'An owner or manager can add photos.'}</span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-control bg-cloud">
              {/* eslint-disable-next-line @next/next/no-img-element -- already resized server-side */}
              <img src={mediaSrc(p.thumbUrl)} alt="" width={480} height={Math.round((480 * p.height) / p.width)} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              {p.isCover && <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-midnight/85 px-2 py-0.5 text-xs font-bold text-white"><Star size={12} weight="fill" aria-hidden /> Cover</span>}
              {canEdit && (
                <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  {!p.isCover && (
                    <button type="button" disabled={pending} onClick={() => act(() => makeCoverPhoto(p.id))} className="h-8 rounded-full bg-white/95 px-3 text-xs font-bold shadow hover:bg-white">
                      Make cover
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { if (confirm('Delete this photo? Members will no longer see it.')) act(() => deleteGymPhoto(p.id)); }}
                    aria-label="Delete photo"
                    className="grid size-8 place-items-center rounded-full bg-white/95 text-danger shadow hover:bg-white"
                  >
                    <Trash size={16} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
