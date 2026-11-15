import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { STORY_HOURS, type ReportInput, type StaffStory, type StoryGroup, type StoryItem, type StoryTray } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { StorageService } from '../media/storage.service.js';
import { VideoService } from '../media/video.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Audience, CommunityAccessService, type Viewer } from './community-access.service.js';
import { fileReport, PostsService } from './posts.service.js';

const storySelect = {
  id: true, gymId: true, authorKind: true, authorUserId: true, type: true, key: true, thumbKey: true, width: true, height: true, caption: true,
  likeCount: true, viewCount: true, createdAt: true, expiresAt: true,
  gym: { select: { id: true, name: true, slug: true, coverUrl: true } },
  author: { select: { id: true, name: true, avatarUrl: true } },
  video: { select: { provider: true, providerId: true, posterKey: true, width: true, height: true, durationSec: true } },
} satisfies Prisma.StorySelect;
type StoryRow = Prisma.StoryGetPayload<{ select: typeof storySelect }>;

export interface NewStory {
  gymId: string;
  authorId: string;
  authorKind: 'gym' | 'member';
  caption?: string;
  photo?: Buffer;
  videoId?: string;
}

/**
 * Stories: one photo or a video up to 60 seconds, gone after 24 hours. Gyms and their members
 * post them; the gym's members and staff see them in the tray at the top of Home. Authors see
 * how many people viewed and liked each one.
 */
@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly videos: VideoService,
    private readonly posts: PostsService,
    private readonly access: CommunityAccessService,
    private readonly audit: AuditService,
  ) {}

  async tray(viewer: Viewer): Promise<StoryTray> {
    const a = await this.access.audience(viewer);
    const now = new Date();
    const [rows, user, gyms] = await Promise.all([
      this.prisma.story.findMany({
        where: {
          status: 'published',
          expiresAt: { gt: now },
          gym: { status: 'active' },
          OR: [{ authorUserId: viewer.userId, authorKind: 'member' }, { gymId: { in: this.access.communityGyms(a) } }],
          NOT: { authorKind: 'member', authorUserId: { in: [...a.hidden] } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
        select: storySelect,
      }),
      this.prisma.user.findUnique({ where: { id: viewer.userId }, select: { communityAcceptedAt: true } }),
      this.prisma.gym.findMany({ where: { id: { in: [...a.memberOf] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const ids = rows.map((r) => r.id);
    const [views, likes] = await Promise.all([
      this.prisma.storyView.findMany({ where: { userId: viewer.userId, storyId: { in: ids } }, select: { storyId: true } }),
      this.prisma.storyLike.findMany({ where: { userId: viewer.userId, storyId: { in: ids } }, select: { storyId: true } }),
    ]);
    const seen = new Set(views.map((v) => v.storyId));
    const liked = new Set(likes.map((l) => l.storyId));

    const groups = new Map<string, StoryGroup>();
    for (const r of rows) {
      const key = r.authorKind === 'gym' ? `gym:${r.gymId}` : `member:${r.authorUserId}`;
      const mine = r.authorKind === 'member' && r.authorUserId === viewer.userId;
      const item = await this.toItem(r, mine, seen.has(r.id) || mine, liked.has(r.id));
      const group = groups.get(key);
      if (group) {
        group.stories.push(item);
        group.allSeen &&= item.seen;
      } else {
        groups.set(key, { key, gym: r.gym, author: this.author(r), mine, allSeen: item.seen, stories: [item] });
      }
    }
    // Yours first, then anything new (most recent first), then what you've seen.
    const latest = (g: StoryGroup) => g.stories.at(-1)!.createdAt;
    const sorted = [...groups.values()].sort((x, y) => Number(y.mine) - Number(x.mine) || Number(x.allSeen) - Number(y.allSeen) || latest(y).localeCompare(latest(x)));
    return { groups: sorted, postableGyms: gyms, communityAccepted: !!user?.communityAcceptedAt };
  }

  async create(input: NewStory): Promise<string> {
    if (!input.photo && !input.videoId) throw new BadRequestException('Add a photo or a video.');
    if (input.photo && input.videoId) throw new BadRequestException('A story is one photo or one video.');
    const [photo] = input.photo ? await this.posts.storePhotos('stories', input.gymId, [input.photo]) : [];
    const expiresAt = new Date(Date.now() + STORY_HOURS * 60 * 60_000);
    const story = await this.prisma.$transaction(async (tx) => {
      const video = input.videoId ? await this.videos.claim(tx, input.authorId, input.videoId, 'story') : null;
      return tx.story.create({
        data: {
          gymId: input.gymId,
          authorUserId: input.authorId,
          authorKind: input.authorKind,
          caption: input.caption || null,
          expiresAt,
          ...(video
            ? { type: 'video', videoUploadId: video.id, width: video.width ?? 720, height: video.height ?? 1280 }
            : { type: 'image', id: photo!.id, key: photo!.key, thumbKey: photo!.thumbKey, width: photo!.photo.large.width, height: photo!.photo.large.height }),
        },
        select: { id: true },
      });
    }).catch(async (err: unknown) => {
      if (photo) await this.storage.delete([photo.key, photo.thumbKey]);
      throw err;
    });
    if (input.authorKind === 'gym') await this.audit.record({ action: 'gym.story_created', actorId: input.authorId, targetType: 'story', targetId: story.id, metadata: { gymId: input.gymId } });
    return story.id;
  }

  async createAsMember(viewer: Viewer, input: Omit<NewStory, 'authorId' | 'authorKind'>): Promise<void> {
    const a = await this.access.audience(viewer);
    await this.access.requireCanPost(a, input.gymId);
    await this.create({ ...input, authorId: viewer.userId, authorKind: 'member' });
  }

  /** Counted once per person; your own views don't count. */
  async view(viewer: Viewer, storyId: string): Promise<void> {
    const story = await this.visible(viewer, storyId);
    if (story.authorKind === 'member' && story.authorUserId === viewer.userId) return;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.storyView.createMany({ data: [{ storyId, userId: viewer.userId }], skipDuplicates: true });
      if (count) await tx.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
    });
  }

  async like(viewer: Viewer, storyId: string, on: boolean): Promise<{ likedByMe: boolean }> {
    const story = await this.visible(viewer, storyId);
    const a = await this.access.audience(viewer);
    if (!this.access.inCommunity(a, story.gymId)) throw new ForbiddenException('Join this gym to like its stories.');
    await this.prisma.$transaction(async (tx) => {
      if (on) {
        const { count } = await tx.storyLike.createMany({ data: [{ storyId, userId: viewer.userId }], skipDuplicates: true });
        if (count) await tx.story.update({ where: { id: storyId }, data: { likeCount: { increment: 1 } } });
      } else {
        const { count } = await tx.storyLike.deleteMany({ where: { storyId, userId: viewer.userId } });
        if (count) await tx.story.update({ where: { id: storyId }, data: { likeCount: { decrement: 1 } } });
      }
    });
    return { likedByMe: on };
  }

  async removeOwn(userId: string, storyId: string): Promise<void> {
    const story = await this.prisma.story.findFirst({ where: { id: storyId, authorUserId: userId, authorKind: 'member' }, select: { id: true } });
    if (!story) throw new NotFoundException('Story not found');
    await this.destroy([story.id]);
  }

  async report(viewer: Viewer, storyId: string, input: ReportInput): Promise<void> {
    await this.visible(viewer, storyId);
    await fileReport(this.prisma, viewer.userId, 'story', storyId, input);
  }

  // ── Gym staff ──
  async staffList(gymId: string): Promise<StaffStory[]> {
    const rows = await this.prisma.story.findMany({ where: { gymId, status: 'published', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 100, select: storySelect });
    return Promise.all(rows.map(async (r) => ({ ...(await this.toItem(r, true, true, false)), author: r.authorKind === 'gym' ? r.gym.name : (r.author.name ?? 'BGYM member'), authorKind: r.authorKind })));
  }

  async staffRemove(gymId: string, storyId: string, actorId: string): Promise<void> {
    const story = await this.prisma.story.findFirst({ where: { id: storyId, gymId }, select: { id: true, authorKind: true } });
    if (!story) throw new NotFoundException('Story not found');
    await this.destroy([story.id]);
    await this.audit.record({ action: 'gym.story_deleted', actorId, targetType: 'story', targetId: storyId, metadata: { gymId, authorKind: story.authorKind } });
  }

  /** Expired stories are deleted with their files an hour after they disappear. */
  @Cron('0 7 * * * *', { name: 'story-cleanup', waitForCompletion: true })
  async cleanup(): Promise<number> {
    const expired = await this.prisma.story.findMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60_000) } }, select: { id: true }, take: 500 });
    await this.destroy(expired.map((s) => s.id));
    return expired.length;
  }

  private async visible(viewer: Viewer, storyId: string): Promise<StoryRow> {
    const [story, a] = await Promise.all([
      this.prisma.story.findFirst({ where: { id: storyId, status: 'published', expiresAt: { gt: new Date() }, gym: { status: 'active' } }, select: storySelect }),
      this.access.audience(viewer),
    ]);
    const mine = story?.authorUserId === viewer.userId;
    if (!story || (!mine && !this.seesStory(a, story))) throw new NotFoundException('Story not found');
    return story;
  }

  /** Stories (the gym's too) are for the gym's community, not the public. */
  private seesStory(a: Audience, s: { gymId: string; authorKind: string; authorUserId: string }): boolean {
    if (s.authorKind === 'member' && a.hidden.has(s.authorUserId)) return false;
    return this.access.inCommunity(a, s.gymId);
  }

  private async destroy(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.prisma.story.findMany({ where: { id: { in: ids } }, select: { key: true, thumbKey: true, video: { select: { id: true, provider: true, providerId: true, posterKey: true } } } });
    await this.prisma.story.deleteMany({ where: { id: { in: ids } } });
    await this.storage.delete(rows.flatMap((r) => [r.key, r.thumbKey]).filter((k): k is string => !!k));
    for (const r of rows) {
      if (!r.video) continue;
      await this.videos.discard(r.video);
      await this.prisma.videoUpload.delete({ where: { id: r.video.id } }).catch(() => undefined);
    }
  }

  private author(r: StoryRow): StoryGroup['author'] {
    return r.authorKind === 'gym' ? { kind: 'gym' } : { kind: 'member', id: r.author.id, name: r.author.name ?? 'BGYM member', avatarUrl: r.author.avatarUrl };
  }

  private async toItem(r: StoryRow, mine: boolean, seen: boolean, likedByMe: boolean): Promise<StoryItem> {
    const media =
      r.type === 'video' && r.video
        ? await this.videos.playback(r.video)
        : { url: this.storage.publicUrl(r.key!), thumbUrl: this.storage.publicUrl(r.thumbKey!), width: r.width, height: r.height, durationSec: undefined };
    return {
      id: r.id,
      type: r.type,
      url: media.url,
      thumbUrl: media.thumbUrl,
      width: media.width,
      height: media.height,
      ...(media.durationSec !== undefined && { durationSec: media.durationSec }),
      caption: r.caption,
      likedByMe,
      seen,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      ...(mine && { viewCount: r.viewCount, likeCount: r.likeCount }),
    };
  }
}
