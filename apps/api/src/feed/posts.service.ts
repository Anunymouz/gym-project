import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FEED_PAGE_SIZE, MAX_POST_PHOTOS, type FeedPage, type FeedPost, type ReportInput, type StaffPost } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { processPhoto } from '../media/image-processor.js';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const postSelect = {
  id: true, body: true, status: true, likeCount: true, createdAt: true,
  gym: { select: { id: true, name: true, slug: true, coverUrl: true } },
  media: { orderBy: { sortOrder: 'asc' }, select: { key: true, thumbKey: true, width: true, height: true } },
} satisfies Prisma.PostSelect;
type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

/** Cursor = "<createdAt ISO>|<id>", base64url: stable paging even when posts share a timestamp. */
const encodeCursor = (p: { createdAt: Date; id: string }) => Buffer.from(`${p.createdAt.toISOString()}|${p.id}`).toString('base64url');
function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(at ?? '');
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id ?? '')) throw new BadRequestException('Invalid cursor');
  return { createdAt, id: id! };
}

/**
 * Gym posts. Owners and managers post; members see posts from gyms where they have an
 * active membership (their Home feed) and can like them; anyone can see a live gym's
 * recent posts on its page, and report a post.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async create(gymId: string, actorId: string, body: string, files: Buffer[]): Promise<StaffPost> {
    if (!body && files.length === 0) throw new BadRequestException('Write something or add a photo.');
    if (files.length > MAX_POST_PHOTOS) throw new BadRequestException(`Up to ${MAX_POST_PHOTOS} photos per post.`);
    // Process every photo before saving anything, so a bad photo doesn't leave half a post.
    const processed = [];
    for (const f of files) processed.push(await processPhoto(f));
    const media = processed.map((p) => {
      const id = randomUUID();
      return { id, key: `posts/${gymId}/${id}.webp`, thumbKey: `posts/${gymId}/${id}_t.webp`, photo: p };
    });
    await Promise.all(media.flatMap((m) => [this.storage.put(m.key, m.photo.large.data, 'image/webp'), this.storage.put(m.thumbKey, m.photo.thumb.data, 'image/webp')]));

    const post = await this.prisma.post.create({
      data: {
        gymId,
        authorUserId: actorId,
        body: body || null,
        status: 'published',
        media: { create: media.map((m, sortOrder) => ({ id: m.id, type: 'image', key: m.key, thumbKey: m.thumbKey, width: m.photo.large.width, height: m.photo.large.height, sortOrder })) },
      },
      select: { id: true },
    });
    await this.audit.record({ action: 'gym.post_created', actorId, targetType: 'post', targetId: post.id, metadata: { gymId, photos: media.length } });
    return (await this.staffList(gymId)).find((p) => p.id === post.id)!;
  }

  async staffList(gymId: string): Promise<StaffPost[]> {
    const rows = await this.prisma.post.findMany({
      where: { gymId, status: { in: ['published', 'hidden', 'removed'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { ...postSelect, author: { select: { name: true, email: true } } },
    });
    const reports = await this.prisma.report.groupBy({ by: ['targetId'], where: { targetType: 'post', targetId: { in: rows.map((r) => r.id) }, status: 'open' }, _count: true });
    const open = new Map(reports.map((r) => [r.targetId, r._count]));
    return rows.map((r) => ({ ...this.toFeedPost(r, false), status: r.status, author: r.author.name ?? r.author.email, openReports: open.get(r.id) ?? 0 }));
  }

  async remove(gymId: string, postId: string, actorId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, gymId }, select: { id: true, media: { select: { key: true, thumbKey: true } } } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.post.delete({ where: { id: post.id } });
    await this.storage.delete(post.media.flatMap((m) => [m.key, m.thumbKey]));
    await this.audit.record({ action: 'gym.post_deleted', actorId, targetType: 'post', targetId: postId, metadata: { gymId } });
  }

  /** Gyms whose posts a member sees: active memberships only. */
  private async followedGyms(userId: string): Promise<string[]> {
    const now = new Date();
    const rows = await this.prisma.membership.findMany({ where: { userId, status: 'active', endsAt: { gt: now } }, distinct: ['gymId'], select: { gymId: true } });
    return rows.map((r) => r.gymId);
  }

  async feed(userId: string, cursor?: string): Promise<FeedPage> {
    const gyms = await this.followedGyms(userId);
    if (gyms.length === 0) return { posts: [], nextCursor: null, gyms: 0 };
    const after = decodeCursor(cursor);
    const rows = await this.prisma.post.findMany({
      where: {
        gymId: { in: gyms },
        status: 'published',
        gym: { status: 'active' },
        ...(after && { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FEED_PAGE_SIZE + 1,
      select: postSelect,
    });
    const page = rows.slice(0, FEED_PAGE_SIZE);
    const liked = await this.likedBy(userId, page.map((p) => p.id));
    return {
      posts: page.map((p) => this.toFeedPost(p, liked.has(p.id))),
      nextCursor: rows.length > FEED_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
      gyms: gyms.length,
    };
  }

  /** A live gym's latest posts, for its public page. */
  async forGym(slug: string, viewerId?: string): Promise<FeedPost[]> {
    const rows = await this.prisma.post.findMany({
      where: { status: 'published', gym: { slug, status: 'active' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: postSelect,
    });
    const liked = viewerId ? await this.likedBy(viewerId, rows.map((r) => r.id)) : new Set<string>();
    return rows.map((r) => this.toFeedPost(r, liked.has(r.id)));
  }

  /** Members of the post's gym can like it. Counts stay exact under double taps. */
  async like(userId: string, postId: string, on: boolean): Promise<{ likeCount: number; likedByMe: boolean }> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, status: 'published' }, select: { id: true, gymId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (!(await this.followedGyms(userId)).includes(post.gymId)) throw new ForbiddenException('Join this gym to like its posts.');
    await this.prisma.$transaction(async (tx) => {
      if (on) {
        const { count } = await tx.postLike.createMany({ data: [{ postId, userId }], skipDuplicates: true });
        if (count) await tx.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
      } else {
        const { count } = await tx.postLike.deleteMany({ where: { postId, userId } });
        if (count) await tx.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
      }
    });
    const { likeCount } = await this.prisma.post.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true } });
    return { likeCount, likedByMe: on };
  }

  async report(userId: string, postId: string, input: ReportInput): Promise<void> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, status: 'published' }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');
    const { count } = await this.prisma.report.createMany({
      data: [{ reporterUserId: userId, targetType: 'post', targetId: postId, reason: input.reason, details: input.details || null }],
      skipDuplicates: true,
    });
    if (count === 0) throw new ConflictException('You’ve already reported this post. Thanks, we’re looking into it.');
  }

  private async likedBy(userId: string, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const rows = await this.prisma.postLike.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } });
    return new Set(rows.map((r) => r.postId));
  }

  private toFeedPost(p: PostRow, likedByMe: boolean): FeedPost {
    return {
      id: p.id,
      gym: p.gym,
      body: p.body,
      media: p.media.map((m) => ({ url: this.storage.publicUrl(m.key), thumbUrl: this.storage.publicUrl(m.thumbKey), width: m.width, height: m.height })),
      likeCount: p.likeCount,
      likedByMe,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
