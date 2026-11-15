import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AdminReport, ReportReason } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const id = z.uuid();

/** BGYM team: reported posts. Removing a post closes every open report on it. */
@Controller('admin')
@Roles('admin')
export class AdminReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
    const postIds = reports.filter((r) => r.targetType === 'post').map((r) => r.targetId);
    const [posts, counts] = await Promise.all([
      this.prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, body: true, status: true, gym: { select: { name: true } }, media: { orderBy: { sortOrder: 'asc' }, select: { thumbKey: true } } } }),
      this.prisma.report.groupBy({ by: ['targetId'], where: { targetType: 'post', targetId: { in: postIds }, status: 'open' }, _count: true }),
    ]);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const count = new Map(counts.map((c) => [c.targetId, c._count]));
    return reports.map((r) => {
      const p = byId.get(r.targetId);
      return {
        id: r.id,
        reason: r.reason as ReportReason,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
        reporter: r.reporter.name ?? r.reporter.email,
        post: p ? { id: p.id, body: p.body, status: p.status, gymName: p.gym.name, thumbs: p.media.map((m) => this.storage.publicUrl(m.thumbKey)), reportCount: count.get(p.id) ?? 0 } : null,
      };
    });
  }

  @Post('reports/:reportId/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(@CurrentUser() user: AccessClaims, @Param('reportId', { schema: id }) reportId: string): Promise<void> {
    const { count } = await this.prisma.report.updateMany({ where: { id: reportId, status: 'open' }, data: { status: 'dismissed', resolvedAt: new Date(), resolvedById: user.userId } });
    if (count === 0) throw new NotFoundException('Report not found');
    await this.audit.record({ action: 'report.dismissed', actorId: user.userId, targetType: 'report', targetId: reportId });
  }

  /** Hides the post from everyone (kept for the record) and closes its open reports. */
  @Post('posts/:postId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePost(@CurrentUser() user: AccessClaims, @Param('postId', { schema: id }) postId: string): Promise<void> {
    const { count } = await this.prisma.post.updateMany({ where: { id: postId, status: { not: 'removed' } }, data: { status: 'removed' } });
    if (count === 0) throw new NotFoundException('Post not found');
    await this.prisma.report.updateMany({ where: { targetType: 'post', targetId: postId, status: 'open' }, data: { status: 'actioned', resolvedAt: new Date(), resolvedById: user.userId } });
    await this.audit.record({ action: 'post.removed', actorId: user.userId, targetType: 'post', targetId: postId });
  }
}
