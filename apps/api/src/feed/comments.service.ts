import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { COMMENTS_PAGE_SIZE, type CommentPage, type PostComment, type ReportInput } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Audience, CommunityAccessService, type Viewer } from './community-access.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { fileReport, PostsService } from './posts.service.js';

const commentSelect = { id: true, body: true, createdAt: true, userId: true, user: { select: { id: true, name: true, avatarUrl: true } } } as const;

/**
 * Comments on posts. Anyone who can see a post can read its comments; members and staff of
 * the gym can comment. A comment can be deleted by its writer, by the post's author, and by
 * the gym's owners and managers (and the BGYM team).
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly access: CommunityAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Oldest first, like a conversation. */
  async list(viewer: Viewer, postId: string, cursor?: string): Promise<CommentPage> {
    const { post, audience } = await this.posts.visible(viewer, postId);
    const after = decodeCursor(cursor);
    const rows = await this.prisma.postComment.findMany({
      where: {
        postId,
        status: 'published',
        userId: { notIn: [...audience.hidden] },
        ...(after && { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: COMMENTS_PAGE_SIZE + 1,
      select: commentSelect,
    });
    const page = rows.slice(0, COMMENTS_PAGE_SIZE);
    return {
      comments: page.map((c) => this.toComment(c, audience, post)),
      nextCursor: rows.length > COMMENTS_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  async add(viewer: Viewer, postId: string, body: string): Promise<PostComment> {
    const { post, audience } = await this.posts.visible(viewer, postId);
    if (!this.access.inCommunity(audience, post.gymId)) throw new ForbiddenException('Join this gym to comment on its posts.');
    await this.access.requireRules(viewer.userId);
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.postComment.create({ data: { postId, userId: viewer.userId, body }, select: commentSelect });
      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      return created;
    });
    return this.toComment(comment, audience, post);
  }

  async remove(viewer: Viewer, commentId: string): Promise<{ commentCount: number }> {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, status: 'published' },
      select: { id: true, userId: true, postId: true, post: { select: { gymId: true, authorKind: true, authorUserId: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    const audience = await this.access.audience(viewer);
    if (!this.canDelete(audience, comment.userId, comment.post)) throw new NotFoundException('Comment not found');
    // Exactly once: two taps can't decrement the count twice.
    const commentCount = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.postComment.updateMany({ where: { id: commentId, status: 'published' }, data: { status: 'removed' } });
      const post = count
        ? await tx.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } }, select: { commentCount: true } })
        : await tx.post.findUniqueOrThrow({ where: { id: comment.postId }, select: { commentCount: true } });
      return post.commentCount;
    });
    if (comment.userId !== viewer.userId && comment.post.authorUserId !== viewer.userId) {
      await this.audit.record({ action: 'comment.removed', actorId: viewer.userId, targetType: 'comment', targetId: commentId, metadata: { gymId: comment.post.gymId } });
    }
    return { commentCount };
  }

  async report(viewer: Viewer, commentId: string, input: ReportInput): Promise<void> {
    const comment = await this.prisma.postComment.findFirst({ where: { id: commentId, status: 'published' }, select: { postId: true, userId: true } });
    if (!comment) throw new NotFoundException('Comment not found');
    const { audience } = await this.posts.visible(viewer, comment.postId);
    if (audience.hidden.has(comment.userId)) throw new NotFoundException('Comment not found');
    await fileReport(this.prisma, viewer.userId, 'comment', commentId, input);
  }

  private canDelete(a: Audience, commentUserId: string, post: { gymId: string; authorKind: string; authorUserId: string }): boolean {
    return commentUserId === a.userId || (post.authorKind === 'member' && post.authorUserId === a.userId) || this.access.moderates(a, post.gymId);
  }

  private toComment(
    c: { id: string; body: string; createdAt: Date; userId: string; user: { id: string; name: string | null; avatarUrl: string | null } },
    a: Audience,
    post: { gymId: string; authorKind: string; authorUserId: string },
  ): PostComment {
    return {
      id: c.id,
      body: c.body,
      author: { id: c.user.id, name: c.user.name ?? 'BGYM member', avatarUrl: c.user.avatarUrl },
      canDelete: this.canDelete(a, c.userId, post),
      createdAt: c.createdAt.toISOString(),
    };
  }
}
