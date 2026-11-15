import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import {
  commentSchema,
  MAX_PHOTO_BYTES,
  MAX_POST_PHOTOS,
  memberPostSchema,
  postBodySchema,
  reportSchema,
  storyBodySchema,
  type CommentInput,
  type CommentPage,
  type FeedPage,
  type FeedPost,
  type PostComment,
  type ReportInput,
  type StaffPost,
  type StoryTray,
} from '@bgym/shared';
import { CurrentUser, Public } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StaffAccessService } from '../staff/staff-access.service.js';
import { CommentsService } from './comments.service.js';
import { PostsService } from './posts.service.js';
import { StoriesService } from './stories.service.js';

const id = z.uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const cursorQuery = z.object({ cursor: z.string().max(200).optional() });
const optionalId = z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional());

/** Photos are held in memory, size-capped and re-encoded; at most a few text fields. */
const photos = (max: number) => FilesInterceptor('photos', max, { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: max, fields: 4, fieldSize: 8_000 } });
const buffers = (files?: Express.Multer.File[]) => (files ?? []).map((f) => f.buffer);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues[0]?.message ?? 'Check what you entered.');
  return result.data;
}
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

@Controller()
export class FeedController {
  constructor(
    private readonly posts: PostsService,
    private readonly comments: CommentsService,
    private readonly stories: StoriesService,
    private readonly access: StaffAccessService,
  ) {}

  // ── Gym staff ──
  @Get('staff/gyms/:gymId/posts')
  async staffList(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<StaffPost[]> {
    await this.access.require(user, gymId);
    return this.posts.staffList(gymId, user.userId);
  }

  /** Multipart: "body", up to 4 "photos", or "videoId" (from POST /videos). */
  @Post('staff/gyms/:gymId/posts')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @UseInterceptors(photos(MAX_POST_PHOTOS))
  async create(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body() form: Record<string, unknown>, @UploadedFiles() files?: Express.Multer.File[]): Promise<StaffPost> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    const body = parse(postBodySchema, str(form?.body) ?? '');
    const videoId = parse(optionalId, form?.videoId);
    const postId = await this.posts.create({ gymId, authorId: user.userId, authorKind: 'gym', body, photos: buffers(files), videoId });
    return (await this.posts.staffList(gymId, user.userId)).find((p) => p.id === postId)!;
  }

  @Delete('staff/gyms/:gymId/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('postId', { schema: id }) postId: string): Promise<void> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    await this.posts.staffRemove(gymId, postId, user.userId);
  }

  @Get('staff/gyms/:gymId/stories')
  async staffStories(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string) {
    await this.access.require(user, gymId);
    return this.stories.staffList(gymId);
  }

  /** Multipart: one "photos" file or "videoId", optional "caption". */
  @Post('staff/gyms/:gymId/stories')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @UseInterceptors(photos(1))
  async staffStory(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body() form: Record<string, unknown>, @UploadedFiles() files?: Express.Multer.File[]) {
    await this.access.require(user, gymId, ['owner', 'manager']);
    const input = parse(storyBodySchema, { gymId, caption: str(form?.caption) || undefined, videoId: str(form?.videoId) || undefined });
    await this.stories.create({ ...input, authorId: user.userId, authorKind: 'gym', photo: buffers(files)[0] });
    return this.stories.staffList(gymId);
  }

  @Delete('staff/gyms/:gymId/stories/:storyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async staffRemoveStory(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('storyId', { schema: id }) storyId: string): Promise<void> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    await this.stories.staffRemove(gymId, storyId, user.userId);
  }

  // ── Members: posts ──
  @Get('feed')
  feed(@CurrentUser() user: AccessClaims, @Query({ schema: cursorQuery }) query: { cursor?: string }): Promise<FeedPage> {
    return this.posts.feed(user, query.cursor);
  }

  /** A member posts to their gym. Multipart: "gymId", "body", up to 4 "photos" or a "videoId". */
  @Post('posts')
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  @UseInterceptors(photos(MAX_POST_PHOTOS))
  createMemberPost(@CurrentUser() user: AccessClaims, @Body() form: Record<string, unknown>, @UploadedFiles() files?: Express.Multer.File[]): Promise<FeedPost> {
    const input = parse(memberPostSchema, { gymId: str(form?.gymId), body: str(form?.body) ?? '', videoId: str(form?.videoId) || undefined });
    return this.posts.createAsMember(user, input.gymId, input.body, buffers(files), input.videoId);
  }

  @Get('posts/:postId')
  getPost(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string): Promise<FeedPost> {
    return this.posts.get(user, postId);
  }

  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOwn(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string): Promise<void> {
    await this.posts.removeOwn(user.userId, postId);
  }

  @Put('posts/:postId/like')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  like(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string) {
    return this.posts.like(user, postId, true);
  }

  @Delete('posts/:postId/like')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  unlike(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string) {
    return this.posts.like(user, postId, false);
  }

  @Post('posts/:postId/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  async report(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string, @Body({ schema: reportSchema }) body: ReportInput): Promise<void> {
    await this.posts.report(user, postId, body);
  }

  // ── Comments ──
  @Get('posts/:postId/comments')
  listComments(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string, @Query({ schema: cursorQuery }) query: { cursor?: string }): Promise<CommentPage> {
    return this.comments.list(user, postId, query.cursor);
  }

  @Post('posts/:postId/comments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  addComment(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string, @Body({ schema: commentSchema }) body: CommentInput): Promise<PostComment> {
    return this.comments.add(user, postId, body.body);
  }

  @Delete('comments/:commentId')
  removeComment(@CurrentUser() user: AccessClaims, @Param('commentId', { schema: id }) commentId: string): Promise<{ commentCount: number }> {
    return this.comments.remove(user, commentId);
  }

  @Post('comments/:commentId/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  async reportComment(@CurrentUser() user: AccessClaims, @Param('commentId', { schema: id }) commentId: string, @Body({ schema: reportSchema }) body: ReportInput): Promise<void> {
    await this.comments.report(user, commentId, body);
  }

  // ── Stories ──
  @Get('stories')
  tray(@CurrentUser() user: AccessClaims): Promise<StoryTray> {
    return this.stories.tray(user);
  }

  /** Multipart: "gymId", one "photos" file or a "videoId", optional "caption". */
  @Post('stories')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @UseInterceptors(photos(1))
  async createStory(@CurrentUser() user: AccessClaims, @Body() form: Record<string, unknown>, @UploadedFiles() files?: Express.Multer.File[]): Promise<StoryTray> {
    const input = parse(storyBodySchema, { gymId: str(form?.gymId), caption: str(form?.caption) || undefined, videoId: str(form?.videoId) || undefined });
    await this.stories.createAsMember(user, { ...input, photo: buffers(files)[0] });
    return this.stories.tray(user);
  }

  @Post('stories/:storyId/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async viewStory(@CurrentUser() user: AccessClaims, @Param('storyId', { schema: id }) storyId: string): Promise<void> {
    await this.stories.view(user, storyId);
  }

  @Put('stories/:storyId/like')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  likeStory(@CurrentUser() user: AccessClaims, @Param('storyId', { schema: id }) storyId: string) {
    return this.stories.like(user, storyId, true);
  }

  @Delete('stories/:storyId/like')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  unlikeStory(@CurrentUser() user: AccessClaims, @Param('storyId', { schema: id }) storyId: string) {
    return this.stories.like(user, storyId, false);
  }

  @Delete('stories/:storyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStory(@CurrentUser() user: AccessClaims, @Param('storyId', { schema: id }) storyId: string): Promise<void> {
    await this.stories.removeOwn(user.userId, storyId);
  }

  @Post('stories/:storyId/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  async reportStory(@CurrentUser() user: AccessClaims, @Param('storyId', { schema: id }) storyId: string, @Body({ schema: reportSchema }) body: ReportInput): Promise<void> {
    await this.stories.report(user, storyId, body);
  }

  // ── Public ──
  /** A live gym's recent posts (as the gym), shown on its page. */
  @Public()
  @Get('gyms/:slug/posts')
  forGym(@Param('slug', { schema: slug }) gymSlug: string): Promise<FeedPost[]> {
    return this.posts.forGym(gymSlug);
  }

  /** What a shared link shows to anyone. Members' posts only reveal which gym they're in. */
  @Public()
  @Get('public/posts/:postId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  preview(@Param('postId', { schema: id }) postId: string) {
    return this.posts.publicPreview(postId);
  }
}
