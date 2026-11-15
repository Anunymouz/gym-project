import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { notificationTopicSchema, type NotificationTopic } from '@bgym/shared';
import type { Env } from '../config/env.js';

const ISSUER = 'bgym-api';
const AUDIENCE = 'bgym-unsubscribe'; // its own audience and key: never usable for anything else

/**
 * Signed links that turn one email topic off for one person, without signing in. Valid for
 * a year so old emails keep working; they can only ever switch emails off.
 */
@Injectable()
export class UnsubscribeService {
  private readonly key: Uint8Array;
  private readonly webUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.key = createHmac('sha256', config.get('JWT_ACCESS_SECRET', { infer: true })).update('bgym-unsubscribe-v1').digest();
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async token(userId: string, topic: NotificationTopic): Promise<string> {
    return new SignJWT({ topic })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('365d')
      .sign(this.key);
  }

  async verify(token: string): Promise<{ userId: string; topic: NotificationTopic } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      const topic = notificationTopicSchema.safeParse(payload.topic);
      return payload.sub && topic.success ? { userId: payload.sub, topic: topic.data } : null;
    } catch {
      return null;
    }
  }

  /** The page link for the email body, and RFC 8058 one-click headers for mail apps. */
  async links(userId: string, topic: NotificationTopic): Promise<{ pageUrl: string; headers: Record<string, string> }> {
    const t = encodeURIComponent(await this.token(userId, topic));
    return {
      pageUrl: `${this.webUrl}/unsubscribe?t=${t}`,
      headers: { 'List-Unsubscribe': `<${this.webUrl}/unsubscribe/one-click?t=${t}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };
  }
}
