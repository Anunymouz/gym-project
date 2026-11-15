import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { StorageService } from './storage.service.js';

const kind = z.enum(['gyms', 'posts']);
const segment = z.string().regex(/^[0-9a-f-]{36}$/);
const file = z.string().regex(/^[0-9a-f-]{36}(_t)?\.webp$/);

/**
 * Development only: serves photos from local disk (production serves them from the CDN, and
 * this returns 404). Public, like any image on a public gym page.
 */
@Controller('media')
@Public()
@SkipThrottle()
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':kind/:gymId/:file')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async serve(@Param('kind', { schema: kind }) folder: string, @Param('gymId', { schema: segment }) gymId: string, @Param('file', { schema: file }) name: string, @Res() res: Response): Promise<void> {
    res.send(await this.storage.read(`${folder}/${gymId}/${name}`));
  }
}
