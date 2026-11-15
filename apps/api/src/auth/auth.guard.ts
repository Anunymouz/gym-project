import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@bgym/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC, REQUIRED_ROLES } from './decorators.js';
import { TokenService, type AccessClaims } from './token.service.js';

/** Global guard: every route requires a valid access token unless marked @Public(), and the roles in @Roles() if set. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AccessClaims }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Please sign in.');
    req.user = await this.tokens.verifyAccess(token);

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (required?.length) {
      const user = await this.prisma.user.findUnique({ where: { id: req.user.userId }, select: { roles: true, status: true } });
      if (!user || user.status !== 'active' || !required.some((r) => user.roles.includes(r))) throw new ForbiddenException('You don’t have access to this.');
    }
    return true;
  }
}
