import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS } from '@bgym/shared';
import { generateOtpCode, hmac, safeEqualHex } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { signInCodeEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Maximum codes sent to one address per hour (stops email bombing). */
const MAX_CODES_PER_HOUR = 5;
export const INVALID_CODE_MESSAGE = 'That code is incorrect or has expired.';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hash(email: string, code: string): string {
    return hmac(this.config.get('OTP_PEPPER', { infer: true }), `${email}:${code}`);
  }

  /**
   * Sends a fresh code unless the address is in its cooldown or over its hourly limit.
   * The caller always gets the same response, so this can't be used to test which emails exist.
   */
  async request(email: string, ipHash: string): Promise<void> {
    const now = Date.now();
    const recent = await this.prisma.emailOtp.findMany({
      where: { email, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last && now - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      this.logger.debug('Code request ignored: cooldown');
      return;
    }
    if (recent.length >= MAX_CODES_PER_HOUR) {
      this.logger.warn('Code request ignored: hourly limit reached');
      return;
    }

    const code = generateOtpCode();
    await this.prisma.$transaction([
      // Only the newest code is ever valid.
      this.prisma.emailOtp.updateMany({
        where: { email, consumedAt: null, expiresAt: { gt: new Date(now) } },
        data: { expiresAt: new Date(now) },
      }),
      this.prisma.emailOtp.create({
        data: { email, codeHash: this.hash(email, code), expiresAt: new Date(now + OTP_TTL_SECONDS * 1000), ipHash },
      }),
    ]);
    await this.mail.send(signInCodeEmail(email, code));
  }

  /** Consumes the code if correct. Throws the same generic error for every failure case. */
  async verify(email: string, code: string): Promise<void> {
    const otp = await this.prisma.emailOtp.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new UnauthorizedException(INVALID_CODE_MESSAGE);

    if (!safeEqualHex(otp.codeHash, this.hash(email, code))) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException(INVALID_CODE_MESSAGE);
    }

    // Conditional update: if two requests race with the same code, only one wins.
    const { count } = await this.prisma.emailOtp.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) throw new UnauthorizedException(INVALID_CODE_MESSAGE);
  }
}
