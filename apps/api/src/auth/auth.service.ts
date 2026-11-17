import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { displayName, OTP_RESEND_COOLDOWN_SECONDS, type AuthSession, type AuthUser, type RequestEmailCodeResponse, type Role, type UpdateProfileInput } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { hmac } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { processAvatar } from '../media/image-processor.js';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

const userSelect = { id: true, email: true, name: true, firstName: true, lastName: true, avatarKey: true, phone: true, roles: true, memberProfile: { select: { goal: true } } } as const;

type UserRow = { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null; avatarKey: string | null; phone: string | null; roles: Role[]; memberProfile: { goal: string | null } | null };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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

    const user = this.toAuthUser(
      existing
        ? await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() }, select: userSelect })
        : await this.prisma.user.create({
            data: { email, lastLoginAt: new Date(), identities: { create: { provider: 'email', providerUserId: email } } },
            select: userSelect,
          }),
    );

    const tokens = await this.tokens.startSession(user.id, user.roles, { userAgent: client.userAgent, ipHash });
    await this.audit.record({ action: existing ? 'auth.sign_in' : 'auth.sign_up', actorId: user.id, targetType: 'user', targetId: user.id, ipHash, metadata: { method: 'email' } });
    return { ...tokens, user, isNewUser: !existing };
  }

  async getUser(userId: string): Promise<AuthUser> {
    return this.toAuthUser(await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect }));
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        name: displayName(input.firstName, input.lastName),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.goal !== undefined && {
          memberProfile: { upsert: { create: { goal: input.goal }, update: { goal: input.goal } } },
        }),
      },
      select: userSelect,
    });
    return this.toAuthUser(user);
  }

  /** A new profile photo: cropped square, re-encoded (metadata removed); the old one is deleted. */
  async setAvatar(userId: string, file: Buffer): Promise<AuthUser> {
    const photo = await processAvatar(file);
    const id = randomUUID();
    const key = `avatars/${userId}/${id}.webp`;
    const thumbKey = `avatars/${userId}/${id}_t.webp`;
    await this.storage.put(key, photo.large, 'image/webp');
    await this.storage.put(thumbKey, photo.thumb, 'image/webp');
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true, avatarThumbKey: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key, avatarThumbKey: thumbKey }, select: userSelect });
    await this.storage.delete([before.avatarKey, before.avatarThumbKey].filter((k): k is string => !!k));
    await this.audit.record({ action: 'profile.photo_changed', actorId: userId, targetType: 'user', targetId: userId });
    return this.toAuthUser(user);
  }

  async removeAvatar(userId: string): Promise<AuthUser> {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true, avatarThumbKey: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null, avatarThumbKey: null }, select: userSelect });
    await this.storage.delete([before.avatarKey, before.avatarThumbKey].filter((k): k is string => !!k));
    if (before.avatarKey) await this.audit.record({ action: 'profile.photo_removed', actorId: userId, targetType: 'user', targetId: userId });
    return this.toAuthUser(user);
  }

  private toAuthUser({ memberProfile, avatarKey, ...u }: UserRow): AuthUser {
    return { ...u, avatarUrl: avatarKey ? this.storage.publicUrl(avatarKey) : null, goal: memberProfile?.goal ?? null };
  }
}
