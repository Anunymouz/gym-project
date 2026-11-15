import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { z } from 'zod';
import type { FeedPost } from '@bgym/shared';
import { ApiError, publicApi } from '@/lib/api.server';
import { mediaSrc } from '@/lib/media';

type Preview = { gym: { name: string; slug: string; coverUrl: string | null }; post: FeedPost | null };

/** What a shared post link shows: a gym's own post in full; a member's post only says where it's from. */
async function load(id: string): Promise<Preview | null> {
  if (!z.uuid().safeParse(id).success) return null;
  try {
    return await publicApi<Preview>(`/v1/public/posts/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Absolute URL for link previews (WhatsApp, iMessage…), which need full addresses. */
async function absolute(url: string): Promise<string> {
  if (/^https?:\/\//.test(url)) return url;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${h.get('x-forwarded-host') ?? h.get('host')}${mediaSrc(url)}`;
}

export async function generateMetadata({ params }: PageProps<'/p/[id]'>): Promise<Metadata> {
  const preview = await load((await params).id);
  if (!preview) return { title: 'Post not found' };
  const { gym, post } = preview;
  const title = post ? `${gym.name} on BGYM` : `A post from ${gym.name}’s community`;
  const description = post?.body?.slice(0, 160) ?? `Members of ${gym.name} share their training on BGYM.`;
  const image = post?.media[0]?.thumbUrl ?? gym.coverUrl;
  return {
    title,
    description,
    referrer: 'no-referrer',
    openGraph: { title, description, type: 'article', siteName: 'BGYM', ...(image && { images: [{ url: await absolute(image) }] }) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description },
  };
}

export default function SharedPost({ params }: PageProps<'/p/[id]'>) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-md">
        <Image src="/brand/bgym-mark.svg" alt="BGYM" width={70} height={60} className="mx-auto mb-5" priority />
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[24px] bg-white" />}>
          <Content params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Content({ params }: { params: PageProps<'/p/[id]'>['params'] }) {
  const { id } = await params;
  const preview = await load(id);
  const openApp = `bgym://post/${id}`;
  const card = 'rounded-[24px] border border-line bg-white p-6 shadow-[0_24px_60px_rgba(13,16,40,0.08)]';

  if (!preview) {
    return (
      <div className={`${card} text-center`}>
        <h1 className="text-xl font-extrabold">This post isn’t available</h1>
        <p className="mt-2 text-mute">It may have been deleted.</p>
      </div>
    );
  }
  const { gym, post } = preview;
  if (!post) {
    return (
      <div className={`${card} text-center`}>
        <h1 className="text-xl font-extrabold">A post from {gym.name}’s community</h1>
        <p className="mt-2 text-mute">Members’ posts are only for people who train at {gym.name}. Open BGYM to see it if you’re a member.</p>
        <a href={openApp} className="mt-5 inline-flex h-12 items-center justify-center rounded-control bg-flare px-6 font-bold text-white">Open in BGYM</a>
      </div>
    );
  }

  const first = post.media[0];
  return (
    <article className={card}>
      <header className="flex items-center gap-3">
        {gym.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- server-resized
          <img src={mediaSrc(gym.coverUrl)} alt="" className="size-11 rounded-full object-cover" />
        ) : (
          <span className="grid size-11 place-items-center rounded-full bg-midnight font-bold text-white">{gym.name[0]}</span>
        )}
        <div>
          <p className="font-bold">{gym.name}</p>
          <p className="text-sm text-mute">{new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </header>
      {post.body && <p className="mt-4 whitespace-pre-wrap">{post.body}</p>}
      {first && (
        <div className="relative mt-4 overflow-hidden rounded-xl bg-midnight">
          {/* eslint-disable-next-line @next/next/no-img-element -- server-resized */}
          <img src={mediaSrc(first.type === 'video' ? first.thumbUrl : first.url)} alt="" className="max-h-[480px] w-full object-cover" />
          {first.type === 'video' && <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 p-3 text-sm font-bold text-white">▶ Watch the video in the BGYM app</span>}
          {post.media.length > 1 && <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-bold text-white">1/{post.media.length}</span>}
        </div>
      )}
      <p className="mt-4 text-sm text-mute">{post.likeCount} likes · {post.commentCount} comments</p>
      <a href={openApp} className="mt-5 flex h-12 items-center justify-center rounded-control bg-flare font-bold text-white">Open in BGYM</a>
      <p className="mt-3 text-center text-sm text-mute">Find gyms near you, join and train with BGYM.</p>
    </article>
  );
}
