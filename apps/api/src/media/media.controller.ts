import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { isValidKey, StorageService } from './storage.service.js';

const kind = z.enum(['gyms', 'posts', 'stories', 'trainers', 'products', 'exercises', 'workouts', 'videos']);
const segment = z.string().regex(/^[0-9a-f-]{36}$/);
const file = z.string().regex(/^[0-9a-f-]{36}(_t\.webp|\.webp|\.mp4)$/);

/**
 * Development only: serves photos and videos from local disk (production serves them from the
 * CDN or Cloudflare Stream, and this returns 404). Files are named by random IDs.
 * Videos support byte ranges, which phones need to play them.
 */
@Controller('media')
@Public()
@SkipThrottle()
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':kind/:folder/:file')
  serve(@Param('kind', { schema: kind }) kindName: string, @Param('folder', { schema: segment }) folder: string, @Param('file', { schema: file }) name: string, @Res() res: Response): void {
    const key = `${kindName}/${folder}/${name}`;
    if (!isValidKey(key)) throw new NotFoundException();
    const path = this.storage.localFile(key);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path, { maxAge: '365d', immutable: true, dotfiles: 'allow', headers: { 'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : 'image/webp' } }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }
}
