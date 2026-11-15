import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { MAX_PHOTO_BYTES, type GymPhotoItem } from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StaffAccessService } from '../staff/staff-access.service.js';
import { GymPhotosService } from './gym-photos.service.js';

const id = z.uuid();

/** Gym photos in the dashboard: all staff can see them; owners and managers change them. */
@Controller('staff/gyms/:gymId/photos')
export class GymPhotosController {
  constructor(
    private readonly photos: GymPhotosService,
    private readonly access: StaffAccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<GymPhotoItem[]> {
    await this.access.require(user, gymId);
    return this.photos.list(gymId);
  }

  @Post()
  @Throttle({ default: { limit: 40, ttl: 60 * 60_000 } })
  // In memory (never written to disk unprocessed); one file, size-capped before we read it.
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 } }))
  async upload(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @UploadedFile() file: Express.Multer.File | undefined): Promise<GymPhotoItem[]> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.photos.upload(gymId, user.userId, file?.buffer);
  }

  @Post(':photoId/cover')
  @HttpCode(HttpStatus.OK)
  async cover(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('photoId', { schema: id }) photoId: string): Promise<GymPhotoItem[]> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.photos.makeCover(gymId, photoId, user.userId);
  }

  @Delete(':photoId')
  async remove(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('photoId', { schema: id }) photoId: string): Promise<GymPhotoItem[]> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.photos.remove(gymId, photoId, user.userId);
  }
}
