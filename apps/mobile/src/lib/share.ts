import { Share } from 'react-native';
import type { FeedPost } from '@bgym/shared';

/** Public web address for shared links (opens the app if installed, a preview page if not). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const postLink = (id: string) => `${WEB_URL}/p/${id}`;

/**
 * Opens the system share sheet with a link to the post. A gym's own post is visible to anyone
 * with the link; a member's post is only shown to people in that gym.
 */
export async function sharePost(post: FeedPost): Promise<void> {
  const url = postLink(post.id);
  const who = post.author.kind === 'gym' ? post.gym.name : `${post.author.name} at ${post.gym.name}`;
  await Share.share({ message: `${who} on BGYM: ${url}`, url, title: `${who} on BGYM` });
}
