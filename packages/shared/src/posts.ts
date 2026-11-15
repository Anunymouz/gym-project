import { z } from 'zod';

export const MAX_POST_PHOTOS = 4;
export const MAX_POST_LENGTH = 1000;
export const FEED_PAGE_SIZE = 20;

export const postBodySchema = z.string().trim().max(MAX_POST_LENGTH, `Keep it under ${MAX_POST_LENGTH} characters`);

export const MAX_COMMENT_LENGTH = 500;
export const COMMENTS_PAGE_SIZE = 30;
/** Longest video in a post / a story, in seconds. Enforced by the server (and Cloudflare Stream). */
export const MAX_POST_VIDEO_SECONDS = 180;
export const MAX_STORY_VIDEO_SECONDS = 60;
/** Biggest video file the app may upload (Cloudflare Stream's basic upload limit). */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const STORY_HOURS = 24;
export const MAX_STORY_CAPTION = 200;

export interface PostMediaItem {
  type: 'image' | 'video';
  /** Image: the large WebP. Video: the playback URL (MP4 in development, HLS in production). */
  url: string;
  /** Image thumbnail, or the video's poster frame. */
  thumbUrl: string;
  width: number;
  height: number;
  durationSec?: number;
}

/** Who a post or story is from: the gym itself, or one of its members. */
export type ContentAuthor =
  | { kind: 'gym' }
  | { kind: 'member'; id: string; name: string; avatarUrl: string | null };

export interface FeedPost {
  id: string;
  gym: { id: string; name: string; slug: string; coverUrl: string | null };
  author: ContentAuthor;
  body: string | null;
  media: PostMediaItem[];
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  /** The viewer wrote it, so they can delete it. */
  mine: boolean;
  createdAt: string;
}

/** A member's post: text plus up to 4 photos or one video (by its upload id). */
export const memberPostSchema = z.object({
  gymId: z.uuid(),
  body: postBodySchema,
  videoId: z.uuid().optional(),
});
export type MemberPostInput = z.infer<typeof memberPostSchema>;

export interface PostComment {
  id: string;
  body: string;
  author: { id: string; name: string; avatarUrl: string | null };
  /** The viewer can delete it (theirs, on their post, or they run the gym). */
  canDelete: boolean;
  createdAt: string;
}
export interface CommentPage {
  comments: PostComment[];
  nextCursor: string | null;
}
export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Write a comment').max(MAX_COMMENT_LENGTH, `Keep it under ${MAX_COMMENT_LENGTH} characters`),
});
export type CommentInput = z.infer<typeof commentSchema>;

// ── Videos ──
export const videoUploadRequestSchema = z.object({ purpose: z.enum(['post', 'story']) });
export type VideoUploadRequest = z.infer<typeof videoUploadRequestSchema>;
export interface VideoUploadTicket {
  id: string;
  /** POST the file here as multipart form data, field "file". One use. */
  uploadUrl: string;
  /** The upload URL is our own API (send the sign-in token) or Cloudflare's (send nothing). */
  authenticated: boolean;
  maxSeconds: number;
  maxBytes: number;
}
export interface VideoUploadStatus {
  id: string;
  status: 'awaiting_upload' | 'processing' | 'ready' | 'failed';
  error: string | null;
  durationSec: number | null;
  posterUrl: string | null;
}

// ── Stories ──
export interface StoryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  durationSec?: number;
  caption: string | null;
  likedByMe: boolean;
  seen: boolean;
  createdAt: string;
  expiresAt: string;
  /** Only on your own stories. */
  viewCount?: number;
  likeCount?: number;
}
/** One ring in the story tray: everything one gym or member posted in the last 24 hours. */
export interface StoryGroup {
  key: string;
  gym: { id: string; name: string; slug: string; coverUrl: string | null };
  author: ContentAuthor;
  mine: boolean;
  allSeen: boolean;
  stories: StoryItem[];
}
export interface StoryTray {
  groups: StoryGroup[];
  /** Gyms the viewer can post stories and posts to (active memberships). */
  postableGyms: { id: string; name: string }[];
  communityAccepted: boolean;
}
export const storyBodySchema = z.object({
  gymId: z.uuid(),
  caption: z.string().trim().max(MAX_STORY_CAPTION).optional(),
  videoId: z.uuid().optional(),
});
export type StoryInput = z.infer<typeof storyBodySchema>;

export interface BlockedUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  blockedAt: string;
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
  /** Who wrote it: the staff member (gym posts) or the member. */
  authorName: string | null;
  openReports: number;
}

export const REPORT_REASONS = { spam: 'Spam or scam', offensive: 'Offensive or abusive', misleading: 'Misleading or false', other: 'Something else' } as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const reportSchema = z.object({
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  details: z.string().trim().max(500).optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export type ReportTarget = 'post' | 'comment' | 'story';

export interface AdminReport {
  id: string;
  targetType: ReportTarget;
  reason: ReportReason;
  details: string | null;
  createdAt: string;
  reporter: string;
  /** What was reported, in a common shape (null when it's already gone). */
  target: { id: string; body: string | null; status: string; gymName: string; author: string; thumbs: string[]; reportCount: number } | null;
}
