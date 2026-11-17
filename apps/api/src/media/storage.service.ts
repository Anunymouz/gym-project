import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Env } from '../config/env.js';

/**
 * Keys we create: (gyms|posts|stories|trainers|products|exercises|workouts|avatars)/<uuid>/<uuid>[_t].webp for photos and
 * videos/<uuid>/<uuid>(.mp4|_t.webp) for videos and their poster frames. Anything else is
 * refused (no path tricks).
 */
const U = '[0-9a-f-]{36}';
const KEY = new RegExp(`^(?:(?:gyms|posts|stories|trainers|products|exercises|workouts|avatars)/${U}/${U}(?:_t)?\\.webp|videos/${U}/${U}(?:\\.mp4|_t\\.webp))$`);
export const isValidKey = (key: string) => KEY.test(key);

/**
 * Where uploaded media lives. "local" keeps files on this server's disk and the API serves
 * them (development); "s3" uses an S3-compatible bucket such as Cloudflare R2, served from
 * MEDIA_PUBLIC_URL (a CDN). Only keys are stored in the database.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: Env['STORAGE_DRIVER'];
  private readonly root: string;
  private readonly s3: S3Client | null;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.driver = config.get('STORAGE_DRIVER', { infer: true });
    this.root = resolve(config.get('STORAGE_LOCAL_DIR', { infer: true }));
    this.s3 =
      this.driver === 's3'
        ? new S3Client({
            region: config.get('S3_REGION', { infer: true }),
            ...(config.get('S3_ENDPOINT', { infer: true }) && { endpoint: config.get('S3_ENDPOINT', { infer: true }) }),
            credentials: { accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true })!, secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true })! },
          })
        : null;
  }

  get servesLocally(): boolean {
    return this.driver === 'local';
  }

  /** Relative to the API in development ("/v1/media/…"), absolute CDN URL in production. */
  /** A member's profile photo URL, or null (the apps show initials). */
  avatarUrl(key: string | null): string | null {
    return key ? this.publicUrl(key) : null;
  }

  publicUrl(key: string): string {
    return this.driver === 's3' ? `${this.config.get('MEDIA_PUBLIC_URL', { infer: true })}/${key}` : `/v1/media/${key}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!isValidKey(key)) throw new Error('Invalid storage key');
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.config.get('S3_BUCKET', { infer: true }), Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  /** Development only: read a file to serve it. */
  async read(key: string): Promise<Buffer> {
    if (!this.servesLocally || !isValidKey(key)) throw new NotFoundException();
    try {
      return await readFile(this.localPath(key));
    } catch {
      throw new NotFoundException();
    }
  }

  /** Development only: the file on disk, so it can be streamed with byte ranges (video). */
  localFile(key: string): string {
    if (!this.servesLocally || !isValidKey(key)) throw new NotFoundException();
    return this.localPath(key);
  }

  /** Best effort: a leftover file is harmless, a failed request must not undo a delete. */
  async delete(keys: string[]): Promise<void> {
    const valid = keys.filter(isValidKey);
    try {
      if (this.s3) {
        if (valid.length) await this.s3.send(new DeleteObjectsCommand({ Bucket: this.config.get('S3_BUCKET', { infer: true }), Delete: { Objects: valid.map((Key) => ({ Key })) } }));
      } else {
        await Promise.all(valid.map((k) => rm(this.localPath(k), { force: true })));
      }
    } catch (err) {
      this.logger.warn(`Couldn't delete media: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private localPath(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid storage key'); // belt and braces
    return path;
  }
}
