import { BadRequestException, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { BlockedUser } from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const id = z.uuid();

/** Community rules and blocking (required for apps where people post: App Store 1.2). */
@Controller('me')
export class CommunityController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('community-rules')
  @HttpCode(HttpStatus.NO_CONTENT)
  async acceptRules(@CurrentUser() user: AccessClaims): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: user.userId, communityAcceptedAt: null }, data: { communityAcceptedAt: new Date() } });
  }

  @Get('blocks')
  async blocks(@CurrentUser() user: AccessClaims): Promise<BlockedUser[]> {
    const rows = await this.prisma.userBlock.findMany({ where: { blockerId: user.userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, blocked: { select: { id: true, name: true, avatarUrl: true } } } });
    return rows.map((r) => ({ id: r.blocked.id, name: r.blocked.name ?? 'BGYM member', avatarUrl: r.blocked.avatarUrl, blockedAt: r.createdAt.toISOString() }));
  }

  /** You and they stop seeing each other's posts, comments and stories. They aren't told. */
  @Put('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  async block(@CurrentUser() user: AccessClaims, @Param('userId', { schema: id }) blockedId: string): Promise<void> {
    if (blockedId === user.userId) throw new BadRequestException('You can’t block yourself.');
    const exists = await this.prisma.user.count({ where: { id: blockedId } });
    if (!exists) throw new NotFoundException('Person not found');
    await this.prisma.userBlock.createMany({ data: [{ blockerId: user.userId, blockedId }], skipDuplicates: true });
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@CurrentUser() user: AccessClaims, @Param('userId', { schema: id }) blockedId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: user.userId, blockedId } });
  }
}
