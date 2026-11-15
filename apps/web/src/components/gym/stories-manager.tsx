'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { CircleNotch, Eye, Heart, Plus, Trash, VideoCamera, X } from '@phosphor-icons/react';
import { MAX_STORY_CAPTION, type StaffStory } from '@bgym/shared';
import { createStory, deleteStory } from '@/app/(dashboards)/gym-actions';
import { mediaSrc } from '@/lib/media';
import { preparePhoto } from '@/lib/prepare-photo';
import { checkVideo, uploadVideo, type VideoProgress } from '@/lib/upload-video';

const hoursLeft = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 3_600_000));

/**
 * Stories from the gym and its members (gone after 24 hours). Owners and managers add the
 * gym's own, see views and likes, and can delete any story that breaks the rules.
 */
export function StoriesManager({ initial, canPost }: { initial: StaffStory[]; canPost: boolean }) {
  const [stories, setStories] = useState(initial);
  const [file, setFile] = useState<{ file: File; preview: string; video: boolean } | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.preview); }, [file]);

  const pick = async (f?: File) => {
    if (input.current) input.current.value = '';
    if (!f) return;
    const video = f.type.startsWith('video/');
    if (video) {
      const problem = await checkVideo(f, 'story');
      if (problem) return setError(problem);
    }
    setError(null);
    setFile({ file: f, preview: URL.createObjectURL(f), video });
  };

  const share = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('caption', caption);
      if (file.video) form.set('videoId', await uploadVideo(file.file, 'story', setProgress));
      else form.append('photo', await preparePhoto(file.file, 1600), 'story.jpg');
      const res = await createStory(form);
      if (res.error) throw new Error(res.error);
      setStories(res.stories ?? []);
      setFile(null);
      setCaption('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t share the story.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <section aria-labelledby="stories-title" className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="stories-title" className="text-lg font-extrabold">Stories</h2>
        <p className="text-sm text-mute">Photos and short videos for your members. Gone after 24 hours.</p>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {canPost && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="grid h-48 w-28 shrink-0 place-items-center rounded-xl border-2 border-dashed border-[#C9CDE0] text-sm font-bold text-mute hover:border-flare hover:text-flare disabled:opacity-50">
            <span className="flex flex-col items-center gap-1.5"><Plus size={22} weight="bold" aria-hidden /> Add story</span>
          </button>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        {stories.length === 0 && !canPost && <p className="text-sm text-mute">No stories right now.</p>}
        {stories.map((s) => (
          <figure key={s.id} className="relative h-48 w-28 shrink-0 overflow-hidden rounded-xl bg-midnight text-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
            <img src={mediaSrc(s.thumbUrl)} alt={s.caption ?? ''} className="absolute inset-0 size-full object-cover opacity-90" />
            <div className="absolute inset-0 bg-linear-to-b from-black/50 via-transparent to-black/70" />
            {s.type === 'video' && <VideoCamera size={16} weight="fill" className="absolute top-2 left-2" aria-label="Video" />}
            {canPost && (
              <button type="button" disabled={pending} aria-label="Delete story" onClick={() => { if (confirm('Delete this story?')) start(async () => { const r = await deleteStory(s.id); if (r.error) setError(r.error); else setStories((l) => l.filter((x) => x.id !== s.id)); }); }} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/50 hover:bg-danger"><Trash size={14} aria-hidden /></button>
            )}
            <figcaption className="absolute inset-x-0 bottom-0 p-2 text-xs">
              <p className="truncate font-bold">{s.authorKind === 'member' ? s.author : 'Your gym'}</p>
              <p className="flex items-center gap-2 text-white/85">
                <span className="inline-flex items-center gap-0.5"><Eye size={12} aria-label="Views" /> {s.viewCount ?? 0}</span>
                <span className="inline-flex items-center gap-0.5"><Heart size={12} aria-label="Likes" /> {s.likeCount ?? 0}</span>
              </p>
              <p className="text-white/70">{hoursLeft(s.expiresAt, now)}h left</p>
            </figcaption>
          </figure>
        ))}
      </div>

      {file && (
        <div className="mt-4 flex flex-col gap-3 rounded-control bg-cloud p-4 sm:flex-row">
          <div className="relative w-28 shrink-0">
            {file.video ? (
              <video src={file.preview} muted playsInline className="h-48 w-28 rounded-xl bg-midnight object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={file.preview} alt="" className="h-48 w-28 rounded-xl object-cover" />
            )}
            <button type="button" onClick={() => setFile(null)} aria-label="Remove" className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-midnight text-white shadow"><X size={12} weight="bold" /></button>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <label htmlFor="story-caption" className="text-sm font-bold">Caption (optional)</label>
            <input id="story-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={MAX_STORY_CAPTION} placeholder="Open till 10pm tonight 💪" className="h-11 rounded-control border border-line bg-white px-3 outline-none focus:border-flare" />
            {progress && <p role="status" className="text-sm font-semibold">{progress.stage === 'uploading' ? `Uploading video ${Math.round(progress.fraction * 100)}%` : 'Getting the video ready…'}</p>}
            <button type="button" onClick={() => void share()} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-50">
              {busy && <CircleNotch size={18} className="animate-spin" aria-hidden />} Share story
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
