import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FEED_PAGE_SIZE, MAX_POST_PHOTOS, type FeedPage, type FeedPost, type ReportInput, type StaffPost } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { processPhoto, type ProcessedPhoto } from '../media/image-processor.js';
import { StorageService } from '../media/storage.service.js';
import { VideoService } from '../media/video.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Audience, CommunityAccessService, type Viewer } from './community-access.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';

const videoSelect = { provider: true, providerId: true, posterKey: true, width: true, height: true, durationSec: true } satisfies Prisma.VideoUploadSelect;

export const postSelect = {
  id: true, gymId: true, authorKind: true, authorUserId: true, body: true, status: true, likeCount: true, commentCount: true, createdAt: true,
  gym: { select: { id: true, name: true, slug: true, coverUrl: true } },
  author: { select: { id: true, name: true, avatarUrl: true } },
  media: { orderBy: { sortOrder: 'asc' }, select: { type: true, key: true, thumbKey: true, width: true, height: true, video: { select: videoSelect } } },
} satisfies Prisma.PostSelect;
type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

export interface NewPost {
  gymId: string;
  authorId: string;
  authorKind: 'gym' | 'member';
  body: string;
  photos: Buffer[];
  videoId?: string;
}

/**
 * Posts in gym communities.
 * - Gyms (owners and managers) post as the gym; those posts are also on the gym's public page.
 * - Members with an active membership post to their gym; only that gym's members and staff see them.
 * - A post has text and up to 4 photos, or one video (up to 3 minutes).
 * Members see posts from their gyms in the Home feed, and can like, comment, share and report.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly videos: VideoService,
    private readonly access: CommunityAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(input: NewPost): Promise<string> {
    const { gymId, photos, videoId } = input;
    if (!input.body && photos.length === 0 && !videoId) throw new BadRequestException('Write something, or add a photo or video.');
    if (photos.length > MAX_POST_PHOTOS) throw new BadRequestException(`Up to ${MAX_POST_PHOTOS} photos per post.`);
    if (photos.length && videoId) throw new BadRequestException('Add photos or a video, not both.');
    // Process every photo before saving anything, so a bad photo doesn't leave half a post.
    const media = await this.storePhotos('posts', gymId, photos);

    const post = await this.prisma.$transaction(async (tx) => {
      const video = videoId ? await this.videos.claim(tx, input.authorId, videoId, 'post') : null;
      return tx.post.create({
        data: {
          gymId,
          authorUserId: input.authorId,
          authorKind: input.authorKind,
          body: input.body || null,
          status: 'published',
          media: {
            create: video
              ? [{ type: 'video', videoUploadId: video.id, width: video.width ?? 720, height: video.height ?? 1280 }]
              : media.map((m, sortOrder) => ({ id: m.id, type: 'image' as const, key: m.key, thumbKey: m.thumbKey, width: m.photo.large.width, height: m.photo.large.height, sortOrder })),
          },
        },
        select: { id: true },
      });
    }).catch(async (err: unknown) => {
      await this.storage.delete(media.flatMap((m) => [m.key, m.thumbKey]));
      throw err;
    });
    if (input.authorKind === 'gym') {
      await this.audit.record({ action: 'gym.post_created', actorId: input.authorId, targetType: 'post', targetId: post.id, metadata: { gymId, photos: media.length, video: !!videoId } });
    }
    return post.id;
  }

  async createAsMember(viewer: Viewer, gymId: string, body: string, photos: Buffer[], videoId?: string): Promise<FeedPost> {
    const a = await this.access.audience(viewer);
    await this.access.requireCanPost(a, gymId);
    const id = await this.create({ gymId, authorId: viewer.userId, authorKind: 'member', body, photos, videoId });
    return this.get(viewer, id);
  }

  async staffList(gymId: string, viewerId: string): Promise<StaffPost[]> {
    const rows = await this.prisma.post.findMany({
      where: { gymId, status: { in: ['published', 'hidden', 'removed'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { ...postSelect, author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    const reports = await this.prisma.report.groupBy({ by: ['targetId'], where: { targetType: 'post', targetId: { in: rows.map((r) => r.id) }, status: 'open' }, _count: true });
    const open = new Map(reports.map((r) => [r.targetId, r._count]));
    return Promise.all(
      rows.map(async (r) => ({ ...(await this.toFeedPost(r, viewerId, false)), status: r.status, authorName: r.author.name ?? r.author.email, openReports: open.get(r.id) ?? 0 })),
    );
  }

  /** Staff: delete any post in their gym (members' posts included). */
  async staffRemove(gymId: string, postId: string, actorId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, gymId }, select: { id: true, authorKind: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.destroy(post.id);
    await this.audit.record({ action: 'gym.post_deleted', actorId, targetType: 'post', targetId: postId, metadata: { gymId, authorKind: post.authorKind } });
  }

  /** A member deletes their own post. */
  async removeOwn(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, authorUserId: userId, authorKind: 'member' }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.destroy(post.id);
  }

  async feed(viewer: Viewer, cursor?: string): Promise<FeedPage> {
    const a = await this.access.audience(viewer);
    const gyms = this.access.communityGyms(a);
    if (gyms.length === 0) return { posts: [], nextCursor: null, gyms: 0 };
    const after = decodeCursor(cursor);
    const rows = await this.prisma.post.findMany({
      where: {
        gymId: { in: gyms },
        status: 'published',
        gym: { status: 'active' },
        NOT: { authorKind: 'member', authorUserId: { in: [...a.hidden] } },
        ...(after && { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: FEED_PAGE_SIZE + 1,
      select: postSelect,
    });
    const page = rows.slice(0, FEED_PAGE_SIZE);
    const liked = await this.likedBy(viewer.userId, page.map((p) => p.id));
    return {
      posts: await Promise.all(page.map((p) => this.toFeedPost(p, viewer.userId, liked.has(p.id)))),
      nextCursor: rows.length > FEED_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
      gyms: gyms.length,
    };
  }

  /** One post (opened from a shared link or a notification), if the viewer may see it. */
  async get(viewer: Viewer, postId: string): Promise<FeedPost> {
    const { post } = await this.visible(viewer, postId);
    const liked = await this.likedBy(viewer.userId, [post.id]);
    return this.toFeedPost(post, viewer.userId, liked.has(post.id));
  }

  /** A live gym's latest posts as the gym, for its public page. Members' posts stay in the community. */
  async forGym(slug: string): Promise<FeedPost[]> {
    const rows = await this.prisma.post.findMany({
      where: { status: 'published', authorKind: 'gym', gym: { slug, status: 'active' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: postSelect,
    });
    return Promise.all(rows.map((r) => this.toFeedPost(r, null, false)));
  }

  /** What a shared link shows to anyone: a gym's own post in full; a member's post, only where it's from. */
  async publicPreview(postId: string): Promise<{ gym: { name: string; slug: string; coverUrl: string | null }; post: FeedPost | null }> {
    const post = await this.prisma.post.findFirst({ where: { id: postId, status: 'published', gym: { status: 'active' } }, select: postSelect });
    if (!post) throw new NotFoundException('Post not found');
    const gym = { name: post.gym.name, slug: post.gym.slug, coverUrl: post.gym.coverUrl };
    return { gym, post: post.authorKind === 'gym' ? await this.toFeedPost(post, null, false) : null };
  }

  /** Members and staff of the post's gym can like it. Counts stay exact under double taps. */
  async like(viewer: Viewer, postId: string, on: boolean): Promise<{ likeCount: number; likedByMe: boolean }> {
    const { post, audience } = await this.visible(viewer, postId);
    if (!this.access.inCommunity(audience, post.gymId)) throw new ForbiddenException('Join this gym to like its posts.');
    await this.prisma.$transaction(async (tx) => {
      if (on) {
        const { count } = await tx.postLike.createMany({ data: [{ postId, userId: viewer.userId }], skipDuplicates: true });
        if (count) await tx.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
      } else {
        const { count } = await tx.postLike.deleteMany({ where: { postId, userId: viewer.userId } });
        if (count) await tx.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
      }
    });
    const { likeCount } = await this.prisma.post.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true } });
    return { likeCount, likedByMe: on };
  }

  async report(viewer: Viewer, postId: string, input: ReportInput): Promise<void> {
    await this.visible(viewer, postId);
    await fileReport(this.prisma, viewer.userId, 'post', postId, input);
  }

  /** The post, if published, its gym is live, and the viewer may see it (404 otherwise: no probing). */
  async visible(viewer: Viewer, postId: string): Promise<{ post: PostRow; audience: Audience }> {
    const [post, audience] = await Promise.all([
      this.prisma.post.findFirst({ where: { id: postId, status: 'published', gym: { status: 'active' } }, select: postSelect }),
      this.access.audience(viewer),
    ]);
    if (!post || !this.access.canSee(audience, post)) throw new NotFoundException('Post not found');
    return { post, audience };
  }

  async toFeedPost(p: PostRow, viewerId: string | null, likedByMe: boolean): Promise<FeedPost> {
    return {
      id: p.id,
      gym: p.gym,
      author: p.authorKind === 'gym' ? { kind: 'gym' } : { kind: 'member', id: p.author.id, name: p.author.name ?? 'BGYM member', avatarUrl: p.author.avatarUrl },
      body: p.body,
      media: await Promise.all(
        p.media.map(async (m) => {
          if (m.type === 'video' && m.video) {
            const v = await this.videos.playback(m.video);
            return { type: 'video' as const, url: v.url, thumbUrl: v.thumbUrl, width: v.width, height: v.height, durationSec: v.durationSec };
          }
          return { type: 'image' as const, url: this.storage.publicUrl(m.key!), thumbUrl: this.storage.publicUrl(m.thumbKey!), width: m.width, height: m.height };
        }),
      ),
      likeCount: p.likeCount,
      likedByMe,
      commentCount: p.commentCount,
      mine: viewerId !== null && p.authorKind === 'member' && p.authorUserId === viewerId,
      createdAt: p.createdAt.toISOString(),
    };
  }

  /** Photos processed and stored under random keys, ready to attach. */
  async storePhotos(folder: 'posts' | 'stories', gymId: string, files: Buffer[]): Promise<Array<{ id: string; key: string; thumbKey: string; photo: ProcessedPhoto }>> {
    const processed: ProcessedPhoto[] = [];
    for (const f of files) processed.push(await processPhoto(f));
    const media = processed.map((photo) => {
      const id = randomUUID();
      return { id, key: `${folder}/${gymId}/${id}.webp`, thumbKey: `${folder}/${gymId}/${id}_t.webp`, photo };
    });
    await Promise.all(media.flatMap((m) => [this.storage.put(m.key, m.photo.large.data, 'image/webp'), this.storage.put(m.thumbKey, m.photo.thumb.data, 'image/webp')]));
    return media;
  }

  private async destroy(postId: string): Promise<void> {
    const media = await this.prisma.postMedia.findMany({ where: { postId }, select: { key: true, thumbKey: true, video: { select: { id: true, provider: true, providerId: true, posterKey: true } } } });
    await this.prisma.post.delete({ where: { id: postId } });
    await this.storage.delete(media.flatMap((m) => [m.key, m.thumbKey]).filter((k): k is string => !!k));
    for (const m of media) {
      if (!m.video) continue;
      await this.videos.discard(m.video);
      await this.prisma.videoUpload.delete({ where: { id: m.video.id } }).catch(() => undefined);
    }
  }

  private async likedBy(userId: string, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const rows = await this.prisma.postLike.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } });
    return new Set(rows.map((r) => r.postId));
  }
}

/** One report per person per item; a repeat says so instead of piling up. */
export async function fileReport(prisma: PrismaService, userId: string, targetType: 'post' | 'comment' | 'story', targetId: string, input: ReportInput): Promise<void> {
  const { count } = await prisma.report.createMany({
    data: [{ reporterUserId: userId, targetType, targetId, reason: input.reason, details: input.details || null }],
    skipDuplicates: true,
  });
  if (count === 0) throw new ConflictException(`You’ve already reported this ${targetType}. Thanks, we’re looking into it.`);
}
