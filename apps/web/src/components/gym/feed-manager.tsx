'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChatCircle, CircleNotch, Flag, Heart, ImageSquare, PaperPlaneTilt, Trash, VideoCamera, X } from '@phosphor-icons/react';
import { MAX_POST_LENGTH, MAX_POST_PHOTOS, type StaffPost } from '@bgym/shared';
import { createPost, deletePost } from '@/app/(dashboards)/gym-actions';
import { formatDateTime } from '@/lib/format';
import { mediaSrc } from '@/lib/media';
import { preparePhoto } from '@/lib/prepare-photo';
import { checkVideo, uploadVideo, type VideoProgress } from '@/lib/upload-video';

type Picked = { file: File; preview: string };

/** Write posts for members' Home feed, and see past posts with their likes and reports. */
export function FeedManager({ initial, canPost, gymName }: { initial: StaffPost[]; canPost: boolean; gymName: string }) {
  const [posts, setPosts] = useState(initial);
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [video, setVideo] = useState<Picked | null>(null);
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // Free preview URLs when photos are removed or the page closes.
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), [picked]);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.preview); }, [video]);

  const pickVideo = async (file?: File) => {
    if (videoInput.current) videoInput.current.value = '';
    if (!file) return;
    const problem = await checkVideo(file, 'post');
    if (problem) return setError(problem);
    setError(null);
    setPicked([]);
    setVideo({ file, preview: URL.createObjectURL(file) });
  };

  const pick = (files: File[]) => {
    const room = MAX_POST_PHOTOS - picked.length;
    if (files.length > room) setError(`Up to ${MAX_POST_PHOTOS} photos per post.`);
    setPicked((p) => [...p, ...files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (input.current) input.current.value = '';
  };

  const submit = async () => {
    setError(null);
    setPosting(true);
    try {
      const form = new FormData();
      form.set('body', body);
      if (video) form.set('videoId', await uploadVideo(video.file, 'post', setProgress));
      // Posts are shown at up to ~1080 px, so shrink to 1600 px: quick to upload on mobile data.
      for (const p of picked) form.append('photos', await preparePhoto(p.file, 1600), 'photo.jpg');
      const res = await createPost(form);
      if (res.error) throw new Error(res.error);
      setPosts((list) => [res.post!, ...list]);
      setBody('');
      setPicked([]);
      setVideo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t post. Try again.');
    } finally {
      setPosting(false);
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      {canPost ? (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-3 self-start rounded-card border border-line bg-white p-5 xl:sticky xl:top-6">
          <h2 className="text-lg font-extrabold">New post</h2>
          <p className="text-sm text-mute">Shown in the Home feed of everyone with an active membership at {gymName}, and on your gym’s page. Up to {MAX_POST_PHOTOS} photos, or a video up to 3 minutes.</p>
          <label htmlFor="post-body" className="sr-only">Post</label>
          <textarea id="post-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_POST_LENGTH} rows={5} placeholder="New classes, opening hours for the holiday, a workout tip…" className="w-full rounded-control border border-line bg-white px-3 py-2.5 outline-none focus:border-flare" />
          <div className="flex justify-end text-xs text-mute">{body.length}/{MAX_POST_LENGTH}</div>
          {picked.length > 0 && (
            <ul className="grid grid-cols-4 gap-2">
              {picked.map((p, i) => (
                <li key={p.preview} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={p.preview} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  <button type="button" onClick={() => setPicked((l) => l.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-midnight text-white shadow"><X size={12} weight="bold" /></button>
                </li>
              ))}
            </ul>
          )}
          {video && (
            <div className="relative">
              <video src={video.preview} controls playsInline className="max-h-72 w-full rounded-lg bg-midnight" />
              <button type="button" onClick={() => setVideo(null)} aria-label="Remove video" className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-midnight text-white shadow"><X size={12} weight="bold" /></button>
            </div>
          )}
          {progress && (
            <div role="status" className="flex flex-col gap-1.5 text-sm font-semibold">
              {progress.stage === 'uploading' ? `Uploading video ${Math.round(progress.fraction * 100)}%` : 'Getting the video ready…'}
              <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full bg-flare transition-[width] ${progress.stage === 'processing' ? 'w-full animate-pulse' : ''}`} style={progress.stage === 'uploading' ? { width: `${Math.round(progress.fraction * 100)}%` } : undefined} /></div>
            </div>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pick([...(e.target.files ?? [])])} />
          <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => void pickVideo(e.target.files?.[0])} />
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button type="button" disabled={picked.length >= MAX_POST_PHOTOS || posting || !!video} onClick={() => input.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line px-3.5 text-sm font-bold hover:bg-cloud disabled:opacity-50">
                <ImageSquare size={18} aria-hidden /> Photos {picked.length > 0 && `(${picked.length}/${MAX_POST_PHOTOS})`}
              </button>
              <button type="button" disabled={posting || !!video || picked.length > 0} onClick={() => videoInput.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-control border-[1.5px] border-line px-3.5 text-sm font-bold hover:bg-cloud disabled:opacity-50">
                <VideoCamera size={18} aria-hidden /> Video
              </button>
            </div>
            <button type="submit" disabled={posting || (!body.trim() && picked.length === 0 && !video)} className="inline-flex h-11 items-center gap-2 rounded-control bg-flare px-5 text-sm font-bold text-white hover:bg-[#f04e14] disabled:opacity-50">
              {posting ? <CircleNotch size={18} className="animate-spin" aria-hidden /> : <PaperPlaneTilt size={18} weight="bold" aria-hidden />} Post
            </button>
          </div>
        </form>
      ) : (
        <p className="self-start rounded-card border border-line bg-white p-5 text-mute">Owners and managers can post to your members’ feed.</p>
      )}

      <section aria-labelledby="posts-title" className="flex flex-col gap-3">
        <h2 id="posts-title" className="font-bold">Posts in your community</h2>
        <p className="-mt-2 text-sm text-mute">Your posts and your members’ posts. Owners and managers can delete any post that breaks the rules.</p>
        {posts.length === 0 && <p className="rounded-card border border-dashed border-[#C9CDE0] bg-white px-6 py-12 text-center text-mute">No posts yet. Your first post appears in members’ Home feed straight away.</p>}
        {posts.map((p) => (
          <article key={p.id} className={`rounded-card border bg-white p-5 ${p.status === 'removed' ? 'border-danger/30' : 'border-line'}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-mute">
                {p.author.kind === 'member' && <span className="mr-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet">Member</span>}
                {p.authorName ?? 'Staff'} · {formatDateTime(p.createdAt)}
              </p>
              {canPost && (
                <button type="button" disabled={pending} onClick={() => { if (confirm(p.author.kind === 'member' ? 'Delete this member’s post? Nobody will see it any more.' : 'Delete this post? Members will no longer see it.')) start(async () => { const r = await deletePost(p.id); if (r.error) setError(r.error); else setPosts((l) => l.filter((x) => x.id !== p.id)); }); }} aria-label="Delete post" className="grid size-8 place-items-center rounded-full text-mute hover:bg-danger-50 hover:text-danger"><Trash size={16} aria-hidden /></button>
              )}
            </div>
            {p.status === 'removed' && <p className="mt-2 rounded-control bg-danger-50 px-3 py-2 text-sm font-semibold text-danger">Removed by the BGYM team after reports. Members can’t see it.</p>}
            {p.body && <p className="mt-2 whitespace-pre-wrap">{p.body}</p>}
            {p.media.length > 0 && (
              <div className={`mt-3 grid gap-1.5 ${p.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {p.media.map((m) =>
                  m.type === 'video' ? (
                    <video key={m.url} src={mediaSrc(m.url)} poster={mediaSrc(m.thumbUrl)} controls preload="none" playsInline className="max-h-96 w-full rounded-lg bg-midnight object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- server-resized
                    <img key={m.thumbUrl} src={mediaSrc(p.media.length === 1 ? m.url : m.thumbUrl)} alt="" loading="lazy" className={`w-full rounded-lg object-cover ${p.media.length === 1 ? 'max-h-96' : 'aspect-square'}`} />
                  ),
                )}
              </div>
            )}
            <div className="mt-3 flex gap-4 text-sm text-mute">
              <span className="inline-flex items-center gap-1"><Heart size={16} aria-hidden /> {p.likeCount}</span>
              <span className="inline-flex items-center gap-1"><ChatCircle size={16} aria-hidden /> {p.commentCount}</span>
              {p.openReports > 0 && <span className="inline-flex items-center gap-1 font-semibold text-flare"><Flag size={16} aria-hidden /> {p.openReports} report{p.openReports === 1 ? '' : 's'} under review</span>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
