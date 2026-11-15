'use client';

import { MAX_POST_VIDEO_SECONDS, MAX_STORY_VIDEO_SECONDS, MAX_VIDEO_BYTES } from '@bgym/shared';
import { startVideo, videoStatus } from '@/app/(dashboards)/gym-actions';

export type VideoProgress = { stage: 'uploading'; fraction: number } | { stage: 'processing' };

/** Length of a video file in seconds, read by the browser (null if it can't tell). */
export function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

/** Checks a picked video before uploading: size and length. Returns an error message or null. */
export async function checkVideo(file: File, purpose: 'post' | 'story'): Promise<string | null> {
  if (file.size > MAX_VIDEO_BYTES) return 'That video is too big (200 MB at most). Try a shorter clip.';
  const max = purpose === 'story' ? MAX_STORY_VIDEO_SECONDS : MAX_POST_VIDEO_SECONDS;
  const seconds = await videoDuration(file);
  if (seconds !== null && seconds > max + 1) return `Videos can be up to ${max >= 60 ? `${max / 60} minute${max === 60 ? '' : 's'}` : `${max} seconds`} long.`;
  return null;
}

/**
 * Uploads a video and waits until it's ready; resolves with its id for a post or story.
 * Development: through this dashboard's upload route to the API. Production: straight to
 * Cloudflare Stream with the one-time URL from the API.
 */
export async function uploadVideo(file: File, purpose: 'post' | 'story', onProgress: (p: VideoProgress) => void): Promise<string> {
  const started = await startVideo(purpose);
  if (!started.ticket) throw new Error(started.error ?? 'Couldn’t start the upload.');
  const { ticket } = started;
  const url = ticket.authenticated ? `/gym/feed/video/${ticket.id}` : ticket.uploadUrl;
  await new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name || 'video.mp4');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress({ stage: 'uploading', fraction: e.loaded / e.total });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = 'The upload didn’t go through. Try again.';
      try {
        const body = JSON.parse(xhr.responseText) as { message?: unknown };
        if (typeof body.message === 'string' && xhr.status < 500) message = body.message;
      } catch {
        /* keep the default */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('The upload didn’t go through. Check your connection.'));
    xhr.send(form);
  });
  onProgress({ stage: 'processing' });
  for (let i = 0; i < 150; i++) {
    const res = await videoStatus(ticket.id);
    if (res.error) throw new Error(res.error);
    if (res.status?.status === 'ready') return ticket.id;
    if (res.status?.status === 'failed') throw new Error(res.status.error ?? 'We couldn’t process that video.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('That video took too long to process. Try again.');
}
