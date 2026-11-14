import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTP_RESEND_COOLDOWN_SECONDS, type AuthSession, type AuthUser, type RequestEmailCodeResponse } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { hmac } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

const userSelect = { id: true, email: true, name: true, phone: true, roles: true } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  hashIp(ip: string): string {
    return hmac(this.config.get('OTP_PEPPER', { infer: true }), `ip:${ip}`).slice(0, 32);
  }

  async requestEmailCode(email: string, ip: string): Promise<RequestEmailCodeResponse> {
    await this.otp.request(email, this.hashIp(ip));
    return { sent: true, retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  }

  /** Verifies the code, creates the account on first sign-in, and starts a session. */
  async verifyEmailCode(email: string, code: string, client: { ip: string; userAgent?: string }): Promise<AuthSession> {
    const ipHash = this.hashIp(client.ip);
    try {
      await this.otp.verify(email, code);
    } catch (err) {
      await this.audit.record({ action: 'auth.email_code_failed', targetType: 'email', ipHash });
      throw err;
    }

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { ...userSelect, status: true } });
    if (existing && existing.status !== 'active') throw new ForbiddenException('This account is not active. Contact BGYM support.');

    const user: AuthUser = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() }, select: userSelect })
      : await this.prisma.user.create({
          data: { email, lastLoginAt: new Date(), identities: { create: { provider: 'email', providerUserId: email } } },
          select: userSelect,
        });

    const tokens = await this.tokens.startSession(user.id, user.roles, { userAgent: client.userAgent, ipHash });
    await this.audit.record({ action: existing ? 'auth.sign_in' : 'auth.sign_up', actorId: user.id, targetType: 'user', targetId: user.id, ipHash, metadata: { method: 'email' } });
    return { ...tokens, user, isNewUser: !existing };
  }

  async getUser(userId: string): Promise<AuthUser> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
  }
}
