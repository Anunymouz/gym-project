import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'node:child_process';
import { createPrivateKey, randomUUID, type KeyObject } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';
import sharp from 'sharp';
import { MAX_POST_VIDEO_SECONDS, MAX_STORY_VIDEO_SECONDS, MAX_VIDEO_BYTES, type VideoUploadStatus, type VideoUploadTicket } from '@bgym/shared';
import type { Env } from '../config/env.js';
import type { Prisma, VideoPurpose, VideoUpload } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';

export const maxSecondsFor = (purpose: VideoPurpose) => (purpose === 'post' ? MAX_POST_VIDEO_SECONDS : MAX_STORY_VIDEO_SECONDS); // stories and exercise demos: 60 s
/** Small grace for container rounding (a "3:00" phone clip can be 180.4 s). */
const GRACE_SECONDS = 1;
/** Members-only playback links last this long; the feed is re-fetched far more often. */
const PLAYBACK_TTL_SECONDS = 6 * 60 * 60;

export interface VideoPlayback {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  durationSec: number;
}

type Probe = { durationSec: number; width: number; height: number; hasVideo: boolean };

/**
 * Videos in posts and stories.
 *
 * - "local": the phone uploads to the API, which checks the length with ffprobe and converts
 *   the clip with ffmpeg (H.264 MP4, at most 1280 px, metadata such as GPS removed), then stores
 *   it with the photos. Good for development and small deployments.
 * - "stream": the phone uploads straight to Cloudflare Stream through a one-time URL that only
 *   accepts clips up to the length limit. Playback links are signed and expire, so members-only
 *   videos can't be passed around.
 *
 * Either way the client gets an upload ticket, sends the file, waits for "ready", then posts.
 * A video can be used by one post or story, by the person who uploaded it.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly driver: Env['VIDEO_DRIVER'];
  private signingKey: KeyObject | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.driver = config.get('VIDEO_DRIVER', { infer: true });
  }

  async createTicket(userId: string, purpose: VideoPurpose): Promise<VideoUploadTicket> {
    // Cap work in flight per person: a phone needs one or two at a time.
    const pending = await this.prisma.videoUpload.count({ where: { userId, usedAt: null, status: { in: ['awaiting_upload', 'processing'] }, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } } });
    if (pending >= 5) throw new ConflictException('You have videos still uploading. Finish or cancel those first.');
    const maxSeconds = maxSecondsFor(purpose);
    const id = randomUUID();

    if (this.driver === 'stream') {
      const res = await this.cf<{ uid: string; uploadURL: string }>('POST', '/stream/direct_upload', {
        maxDurationSeconds: maxSeconds,
        expiry: new Date(Date.now() + 30 * 60_000).toISOString(),
        creator: userId,
        requireSignedURLs: true,
        meta: { name: `bgym-${purpose}-${id}` },
      });
      await this.prisma.videoUpload.create({ data: { id, userId, purpose, provider: 'stream', providerId: res.uid } });
      return { id, uploadUrl: res.uploadURL, authenticated: false, maxSeconds, maxBytes: MAX_VIDEO_BYTES };
    }
    await this.prisma.videoUpload.create({ data: { id, userId, purpose, provider: 'local' } });
    return { id, uploadUrl: `/v1/videos/${id}/file`, authenticated: true, maxSeconds, maxBytes: MAX_VIDEO_BYTES };
  }

  /** Local driver: the uploaded file (in a temp path) is checked, converted and stored. */
  async receiveLocal(userId: string, id: string, tempPath: string): Promise<VideoUploadStatus> {
    if (this.driver !== 'local') throw new NotFoundException();
    // Claim the ticket exactly once (a second upload to the same ticket is refused).
    const { count } = await this.prisma.videoUpload.updateMany({ where: { id, userId, provider: 'local', status: 'awaiting_upload' }, data: { status: 'processing' } });
    if (!count) throw new NotFoundException('Upload not found or already used.');
    const upload = await this.prisma.videoUpload.findUniqueOrThrow({ where: { id } });
    const work = await mkdtemp(join(tmpdir(), 'bgym-video-'));
    try {
      const input = await this.probe(tempPath).catch(() => null);
      if (!input?.hasVideo) return await this.fail(id, 'That file isn’t a video we can play. Use an MP4 or MOV.');
      const max = maxSecondsFor(upload.purpose);
      if (input.durationSec > max + GRACE_SECONDS) return await this.fail(id, `Videos can be up to ${max >= 60 ? `${max / 60} minute${max === 60 ? '' : 's'}` : `${max} seconds`} long.`);

      const out = join(work, 'out.mp4');
      // Long side at most 1280 px, H.264/AAC for every phone, fast start for streaming,
      // and no metadata (phones record GPS location in video files too).
      await this.run(this.config.get('FFMPEG_PATH', { infer: true }), [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', tempPath, '-t', String(max + GRACE_SECONDS),
        '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
        '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-profile:v', 'main',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', out,
      ], 10 * 60_000);
      const output = await this.probe(out);
      const poster = await this.run(this.config.get('FFMPEG_PATH', { infer: true }), ['-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(0.5, output.durationSec / 2)), '-i', out, '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1'], 60_000);
      const posterWebp = await sharp(poster).resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();

      const key = `videos/${userId}/${id}.mp4`;
      const posterKey = `videos/${userId}/${id}_t.webp`;
      await this.storage.put(key, await readFile(out), 'video/mp4');
      await this.storage.put(posterKey, posterWebp, 'image/webp');
      await this.prisma.videoUpload.update({
        where: { id },
        data: { status: 'ready', providerId: key, posterKey, durationSec: output.durationSec, width: output.width, height: output.height, readyAt: new Date() },
      });
      return this.status(userId, id);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(`Video ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
      return await this.fail(id, 'We couldn’t process that video. Try a different one.');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  /** Where an upload is; asks Cloudflare while it's still processing. */
  async status(userId: string, id: string): Promise<VideoUploadStatus> {
    let upload = await this.prisma.videoUpload.findFirst({ where: { id, userId } });
    if (!upload) throw new NotFoundException('Upload not found');
    if (upload.provider === 'stream' && (upload.status === 'awaiting_upload' || upload.status === 'processing')) upload = await this.refreshStream(upload);
    return {
      id: upload.id,
      status: upload.status,
      error: upload.error,
      durationSec: upload.durationSec,
      posterUrl: upload.status === 'ready' ? (await this.playback(upload)).thumbUrl : null,
    };
  }

  /**
   * Takes a ready, unused video of the right kind for a post or story, inside the caller's
   * transaction. Exactly once: the same video can't end up in two posts.
   */
  async claim(tx: Prisma.TransactionClient, userId: string, id: string, purpose: VideoPurpose): Promise<VideoUpload> {
    const { count } = await tx.videoUpload.updateMany({ where: { id, userId, purpose, status: 'ready', usedAt: null }, data: { usedAt: new Date() } });
    if (!count) throw new BadRequestException('That video isn’t ready yet, or was already used.');
    return tx.videoUpload.findUniqueOrThrow({ where: { id } });
  }

  /** Playback and poster URLs. Stream links are signed for a few hours. */
  async playback(upload: Pick<VideoUpload, 'provider' | 'providerId' | 'posterKey' | 'width' | 'height' | 'durationSec'>): Promise<VideoPlayback> {
    const base = { width: upload.width ?? 720, height: upload.height ?? 1280, durationSec: upload.durationSec ?? 0 };
    if (upload.provider === 'stream') {
      const token = await this.signStream(upload.providerId!);
      const host = `https://customer-${this.config.get('CF_STREAM_CUSTOMER_CODE', { infer: true })}.cloudflarestream.com/${token}`;
      return { ...base, url: `${host}/manifest/video.m3u8`, thumbUrl: `${host}/thumbnails/thumbnail.jpg?time=1s&height=960` };
    }
    return { ...base, url: this.storage.publicUrl(upload.providerId!), thumbUrl: this.storage.publicUrl(upload.posterKey!) };
  }

  /** Removes the files (best effort). */
  async discard(upload: Pick<VideoUpload, 'provider' | 'providerId' | 'posterKey'>): Promise<void> {
    if (upload.provider === 'stream') {
      if (upload.providerId) await this.cf('DELETE', `/stream/${upload.providerId}`).catch((e: unknown) => this.logger.warn(`Couldn't delete Stream video: ${String(e)}`));
      return;
    }
    await this.storage.delete([upload.providerId, upload.posterKey].filter((k): k is string => !!k));
  }

  /** Uploads nobody posted within a day are deleted. */
  @Cron('0 17 * * * *', { name: 'video-cleanup', waitForCompletion: true })
  async cleanup(): Promise<number> {
    const stale = await this.prisma.videoUpload.findMany({ where: { usedAt: null, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } }, take: 200 });
    for (const upload of stale) {
      await this.discard(upload);
      await this.prisma.videoUpload.delete({ where: { id: upload.id } });
    }
    return stale.length;
  }

  // ── internals ──

  private async fail(id: string, message: string): Promise<VideoUploadStatus> {
    const upload = await this.prisma.videoUpload.update({ where: { id }, data: { status: 'failed', error: message } });
    return { id, status: 'failed', error: message, durationSec: upload.durationSec, posterUrl: null };
  }

  private async refreshStream(upload: VideoUpload): Promise<VideoUpload> {
    type StreamVideo = { readyToStream: boolean; duration: number; input?: { width: number; height: number }; status?: { state: string; errorReasonText?: string } };
    let video: StreamVideo;
    try {
      video = await this.cf<StreamVideo>('GET', `/stream/${upload.providerId}`);
    } catch {
      return upload; // Try again on the next poll.
    }
    if (video.status?.state === 'error') {
      return this.prisma.videoUpload.update({ where: { id: upload.id }, data: { status: 'failed', error: video.status.errorReasonText || 'We couldn’t process that video.' } });
    }
    if (video.readyToStream) {
      if (video.duration > maxSecondsFor(upload.purpose) + GRACE_SECONDS) {
        await this.discard(upload);
        return this.prisma.videoUpload.update({ where: { id: upload.id }, data: { status: 'failed', error: 'That video is too long.' } });
      }
      return this.prisma.videoUpload.update({
        where: { id: upload.id },
        data: { status: 'ready', durationSec: video.duration, width: video.input?.width ?? null, height: video.input?.height ?? null, readyAt: new Date() },
      });
    }
    const state = video.status?.state;
    return state && state !== 'pendingupload' && upload.status !== 'processing' ? this.prisma.videoUpload.update({ where: { id: upload.id }, data: { status: 'processing' } }) : upload;
  }

  private async cf<T>(method: string, path: string, body?: unknown): Promise<T> {
    const account = this.config.get('CF_ACCOUNT_ID', { infer: true });
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.config.get('CF_STREAM_API_TOKEN', { infer: true })}`, 'Content-Type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T } | null;
    if (!res.ok || !json?.success) throw new Error(`Cloudflare Stream ${method} ${path} failed (${res.status})`);
    return json.result as T;
  }

  private async signStream(uid: string): Promise<string> {
    this.signingKey ??= createPrivateKey(Buffer.from(this.config.get('CF_STREAM_SIGNING_KEY_PEM', { infer: true })!, 'base64').toString());
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: this.config.get('CF_STREAM_SIGNING_KEY_ID', { infer: true })! })
      .setSubject(uid)
      .setExpirationTime(Math.floor(Date.now() / 1000) + PLAYBACK_TTL_SECONDS)
      .sign(this.signingKey);
  }

  private async probe(path: string): Promise<Probe> {
    const out = await this.run(this.config.get('FFPROBE_PATH', { infer: true }), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], 60_000);
    const json = JSON.parse(out.toString()) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } }[] };
    const video = json.streams?.find((s) => s.codec_type === 'video' && s.width && s.height);
    const rotation = Math.abs(Number(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0)) % 180;
    return {
      hasVideo: !!video,
      durationSec: Number(json.format?.duration ?? 0),
      width: rotation === 90 ? (video?.height ?? 0) : (video?.width ?? 0),
      height: rotation === 90 ? (video?.width ?? 0) : (video?.height ?? 0),
    };
  }

  /** Runs a tool without a shell (no injection), with a time limit; resolves to its stdout. */
  private run(cmd: string, args: string[], timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, killSignal: 'SIGKILL' });
      const out: Buffer[] = [];
      let err = '';
      child.stdout.on('data', (d: Buffer) => out.push(d));
      child.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} exited ${code}: ${err.trim()}`))));
    });
  }
}
