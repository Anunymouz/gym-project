import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AdminReport, ReportReason, ReportTarget } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StorageService } from '../media/storage.service.js';
import { VideoService } from '../media/video.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const id = z.uuid();
const targetTypes = z.enum(['posts', 'comments', 'stories']);

/** BGYM team: reported posts, comments and stories. Removing one closes every open report on it. */
@Controller('admin')
@Roles('admin')
export class AdminReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly videos: VideoService,
    private readonly audit: AuditService,
  ) {}

  @Get('reports')
  async open(): Promise<AdminReport[]> {
    const reports = await this.prisma.report.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, reason: true, details: true, createdAt: true, targetType: true, targetId: true, reporter: { select: { name: true, email: true } } },
    });
    const idsOf = (t: ReportTarget) => reports.filter((r) => r.targetType === t).map((r) => r.targetId);
    const name = (u: { name: string | null; email: string }) => u.name ?? u.email;
    const [posts, comments, stories, counts] = await Promise.all([
      this.prisma.post.findMany({
        where: { id: { in: idsOf('post') } },
        select: { id: true, body: true, status: true, authorKind: true, author: { select: { name: true, email: true } }, gym: { select: { name: true } }, media: { orderBy: { sortOrder: 'asc' }, select: { thumbKey: true, video: { select: { provider: true, providerId: true, posterKey: true, width: true, height: true, durationSec: true } } } } },
      }),
      this.prisma.postComment.findMany({ where: { id: { in: idsOf('comment') } }, select: { id: true, body: true, status: true, user: { select: { name: true, email: true } }, post: { select: { gym: { select: { name: true } } } } } }),
      this.prisma.story.findMany({ where: { id: { in: idsOf('story') } }, select: { id: true, caption: true, status: true, authorKind: true, thumbKey: true, author: { select: { name: true, email: true } }, gym: { select: { name: true } }, video: { select: { provider: true, providerId: true, posterKey: true, width: true, height: true, durationSec: true } } } }),
      this.prisma.report.groupBy({ by: ['targetId'], where: { targetId: { in: reports.map((r) => r.targetId) }, status: 'open' }, _count: true }),
    ]);
    const count = new Map(counts.map((c) => [c.targetId, c._count]));
    const thumb = async (m: { thumbKey: string | null; video: Parameters<VideoService['playback']>[0] | null }) => (m.video ? (await this.videos.playback(m.video)).thumbUrl : this.storage.publicUrl(m.thumbKey!));
    const targets = new Map<string, NonNullable<AdminReport['target']>>();
    for (const p of posts) targets.set(p.id, { id: p.id, body: p.body, status: p.status, gymName: p.gym.name, author: p.authorKind === 'gym' ? p.gym.name : name(p.author), thumbs: await Promise.all(p.media.map(thumb)), reportCount: count.get(p.id) ?? 0 });
    for (const c of comments) targets.set(c.id, { id: c.id, body: c.body, status: c.status, gymName: c.post.gym.name, author: name(c.user), thumbs: [], reportCount: count.get(c.id) ?? 0 });
    for (const s of stories) targets.set(s.id, { id: s.id, body: s.caption, status: s.status, gymName: s.gym.name, author: s.authorKind === 'gym' ? s.gym.name : name(s.author), thumbs: [await thumb(s)], reportCount: count.get(s.id) ?? 0 });
    return reports.map((r) => ({
      id: r.id,
      targetType: r.targetType as ReportTarget,
      reason: r.reason as ReportReason,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      reporter: name(r.reporter),
      target: targets.get(r.targetId) ?? null,
    }));
  }

  @Post('reports/:reportId/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(@CurrentUser() user: AccessClaims, @Param('reportId', { schema: id }) reportId: string): Promise<void> {
    const { count } = await this.prisma.report.updateMany({ where: { id: reportId, status: 'open' }, data: { status: 'dismissed', resolvedAt: new Date(), resolvedById: user.userId } });
    if (count === 0) throw new NotFoundException('Report not found');
    await this.audit.record({ action: 'report.dismissed', actorId: user.userId, targetType: 'report', targetId: reportId });
  }

  /**
   * Hides a post, comment or story from everyone (kept for the record) and closes its open
   * reports. A removed comment no longer counts on its post.
   */
  @Post(':targetType/:targetId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AccessClaims, @Param('targetType', { schema: targetTypes }) type: 'posts' | 'comments' | 'stories', @Param('targetId', { schema: id }) targetId: string): Promise<void> {
    const where = { id: targetId, status: { not: 'removed' as const } };
    const data = { status: 'removed' as const };
    const targetType = type === 'posts' ? 'post' : type === 'comments' ? 'comment' : 'story';
    await this.prisma.$transaction(async (tx) => {
      let count = 0;
      if (type === 'posts') ({ count } = await tx.post.updateMany({ where, data }));
      else if (type === 'stories') ({ count } = await tx.story.updateMany({ where, data }));
      else {
        const comment = await tx.postComment.findFirst({ where: { id: targetId, status: 'published' }, select: { postId: true } });
        ({ count } = await tx.postComment.updateMany({ where: { id: targetId, status: 'published' }, data }));
        if (count && comment) await tx.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } });
      }
      if (count === 0) throw new NotFoundException('Not found, or already removed');
      await tx.report.updateMany({ where: { targetType, targetId, status: 'open' }, data: { status: 'actioned', resolvedAt: new Date(), resolvedById: user.userId } });
    });
    await this.audit.record({ action: `${targetType}.removed`, actorId: user.userId, targetType, targetId });
  }
}
