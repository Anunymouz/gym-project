import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MAX_VIDEO_BYTES, videoUploadRequestSchema, type VideoUploadRequest, type VideoUploadStatus, type VideoUploadTicket } from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { VideoService } from './video.service.js';

const id = z.uuid();

@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideoService) {}

  /** Step 1: get somewhere to send the video. */
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  ticket(@CurrentUser() user: AccessClaims, @Body({ schema: videoUploadRequestSchema }) body: VideoUploadRequest): Promise<VideoUploadTicket> {
    return this.videos.createTicket(user.userId, body.purpose);
  }

  /**
   * Step 2 (development driver only): the file itself. Written to a temp file with a random
   * name (videos are too big to hold in memory), size-capped, and deleted after processing.
   */
  @Post(':id/file')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: tmpdir(), filename: (_req, _file, cb) => cb(null, `bgym-upload-${randomUUID()}`) }), limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 0 } }))
  async upload(@CurrentUser() user: AccessClaims, @Param('id', { schema: id }) uploadId: string, @UploadedFile() file: Express.Multer.File | undefined): Promise<VideoUploadStatus> {
    if (!file) throw new BadRequestException('Choose a video to upload.');
    try {
      return await this.videos.receiveLocal(user.userId, uploadId, file.path);
    } finally {
      await rm(file.path, { force: true });
    }
  }

  /** Step 3: poll until "ready", then use the id in a post or story. */
  @Get(':id')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  status(@CurrentUser() user: AccessClaims, @Param('id', { schema: id }) uploadId: string): Promise<VideoUploadStatus> {
    return this.videos.status(user.userId, uploadId);
  }
}
