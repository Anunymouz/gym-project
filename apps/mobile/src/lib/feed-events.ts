import type { FeedPost } from '@bgym/shared';

/** Tells Home about a post made in the composer, so it appears at the top without a reload. */
const listeners = new Set<(post: FeedPost) => void>();
export const feedEvents = {
  posted(post: FeedPost) {
    for (const l of listeners) l(post);
  },
  onPosted(fn: (post: FeedPost) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
