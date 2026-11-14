import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import type { AuthTokens, Role } from '@bgym/shared';
import { generateOpaqueToken, sha256 } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const ISSUER = 'bgym-api';
const AUDIENCE = 'bgym';
const SESSION_INVALID = 'Your session has ended. Please sign in again.';

export interface AccessClaims {
  userId: string;
  sessionId: string;
  roles: Role[];
}

export interface ClientMeta {
  userAgent?: string | undefined;
  ipHash?: string | undefined;
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.key = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET', { infer: true }));
  }

  /** Starts a new session: a refresh token (stored hashed) and a short-lived access token. */
  async startSession(userId: string, roles: Role[], meta: ClientMeta): Promise<AuthTokens> {
    const refreshToken = generateOpaqueToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ipHash: meta.ipHash ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return { ...(await this.signAccess({ userId, sessionId: session.id, roles })), refreshToken };
  }

  /**
   * Refresh-token rotation. Each refresh token works once; presenting a used one means it was
   * copied, so every session for that account is revoked (OWASP refresh-token reuse detection).
   */
  async rotate(refreshToken: string, meta: ClientMeta): Promise<AuthTokens> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: { select: { roles: true, status: true } } },
    });
    if (!session) throw new UnauthorizedException(SESSION_INVALID);

    if (session.revokedAt) {
      await this.revokeAllForUser(session.userId);
      await this.audit.record({ action: 'auth.refresh_token_reuse', actorId: session.userId, targetType: 'session', targetId: session.id, ipHash: meta.ipHash ?? null });
      throw new UnauthorizedException(SESSION_INVALID);
    }
    if (session.expiresAt <= new Date() || session.user.status !== 'active') throw new UnauthorizedException(SESSION_INVALID);

    const { count } = await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count !== 1) throw new UnauthorizedException(SESSION_INVALID);
    return this.startSession(session.userId, session.user.roles, meta);
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { refreshTokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !Array.isArray(payload.roles)) throw new Error('bad claims');
      return { userId: payload.sub, sessionId: payload.sid, roles: payload.roles as Role[] };
    } catch {
      throw new UnauthorizedException(SESSION_INVALID);
    }
  }

  private async signAccess(claims: AccessClaims): Promise<Omit<AuthTokens, 'refreshToken'>> {
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
    const accessToken = await new SignJWT({ sid: claims.sessionId, roles: claims.roles })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { accessToken, accessTokenExpiresAt: expiresAt.toISOString() };
  }
}
