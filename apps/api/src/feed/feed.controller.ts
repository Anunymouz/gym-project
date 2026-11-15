import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { MAX_PHOTO_BYTES, MAX_POST_PHOTOS, postBodySchema, reportSchema, type FeedPage, type FeedPost, type ReportInput, type StaffPost } from '@bgym/shared';
import { CurrentUser, Public } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StaffAccessService } from '../staff/staff-access.service.js';
import { PostsService } from './posts.service.js';

const id = z.uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const cursorQuery = z.object({ cursor: z.string().max(200).optional() });

@Controller()
export class FeedController {
  constructor(
    private readonly posts: PostsService,
    private readonly access: StaffAccessService,
  ) {}

  // ── Gym staff ──
  @Get('staff/gyms/:gymId/posts')
  async staffList(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<StaffPost[]> {
    await this.access.require(user, gymId);
    return this.posts.staffList(gymId);
  }

  /** Multipart: "body" text and up to 4 "photos" (held in memory, size-capped, re-encoded). */
  @Post('staff/gyms/:gymId/posts')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @UseInterceptors(FilesInterceptor('photos', MAX_POST_PHOTOS, { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_POST_PHOTOS, fields: 1, fieldSize: 8_000 } }))
  async create(
    @CurrentUser() user: AccessClaims,
    @Param('gymId', { schema: id }) gymId: string,
    @Body() form: { body?: unknown },
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<StaffPost> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    const body = postBodySchema.safeParse(typeof form?.body === 'string' ? form.body : '');
    if (!body.success) throw new BadRequestException(body.error.issues[0]?.message ?? 'Check the post text.');
    return this.posts.create(gymId, user.userId, body.data, (files ?? []).map((f) => f.buffer));
  }

  @Delete('staff/gyms/:gymId/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('postId', { schema: id }) postId: string): Promise<void> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    await this.posts.remove(gymId, postId, user.userId);
  }

  // ── Members ──
  @Get('feed')
  feed(@CurrentUser() user: AccessClaims, @Query({ schema: cursorQuery }) query: { cursor?: string }): Promise<FeedPage> {
    return this.posts.feed(user.userId, query.cursor);
  }

  @Put('posts/:postId/like')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  like(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string) {
    return this.posts.like(user.userId, postId, true);
  }

  @Delete('posts/:postId/like')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  unlike(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string) {
    return this.posts.like(user.userId, postId, false);
  }

  @Post('posts/:postId/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  async report(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string, @Body({ schema: reportSchema }) body: ReportInput): Promise<void> {
    await this.posts.report(user.userId, postId, body);
  }

  /** A live gym's recent posts, shown on its page (public, like the rest of the page). */
  @Public()
  @Get('gyms/:slug/posts')
  forGym(@Param('slug', { schema: slug }) gymSlug: string): Promise<FeedPost[]> {
    return this.posts.forGym(gymSlug);
  }
}
