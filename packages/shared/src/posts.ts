import { z } from 'zod';

export const MAX_POST_PHOTOS = 4;
export const MAX_POST_LENGTH = 1000;
export const FEED_PAGE_SIZE = 20;

export const postBodySchema = z.string().trim().max(MAX_POST_LENGTH, `Keep it under ${MAX_POST_LENGTH} characters`);

export interface PostMediaItem {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface FeedPost {
  id: string;
  gym: { id: string; name: string; slug: string; coverUrl: string | null };
  body: string | null;
  media: PostMediaItem[];
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface FeedPage {
  posts: FeedPost[];
  /** Pass back as ?cursor= for the next (older) page; null at the end. */
  nextCursor: string | null;
  /** How many gyms the member's feed follows (0 = no active membership yet). */
  gyms: number;
}

/** A post as the gym sees it in its dashboard. */
export interface StaffPost extends FeedPost {
  status: 'draft' | 'published' | 'hidden' | 'removed';
  author: string | null;
  openReports: number;
}

export const REPORT_REASONS = { spam: 'Spam or scam', offensive: 'Offensive or abusive', misleading: 'Misleading or false', other: 'Something else' } as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const reportSchema = z.object({
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  details: z.string().trim().max(500).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export interface AdminReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  reporter: string;
  post: { id: string; body: string | null; status: string; gymName: string; thumbs: string[]; reportCount: number } | null;
}
