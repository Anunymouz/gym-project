import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { PASS_TTL_SECONDS } from '@bgym/shared';
import type { Env } from '../config/env.js';

const ISSUER = 'bgym-api';
const AUDIENCE = 'bgym-checkin'; // distinct audience: a pass can never be used as an access token

export interface PassClaims {
  membershipId: string;
  gymId: string;
  userId: string;
}

/** Signs and checks the short-lived tokens shown as the member's QR code. */
@Injectable()
export class PassService {
  private readonly key: Uint8Array;
  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET', { infer: true }));
  }

  async sign(claims: PassClaims): Promise<{ token: string; expiresAt: string }> {
    const exp = Math.floor(Date.now() / 1000) + PASS_TTL_SECONDS;
    const token = await new SignJWT({ mid: claims.membershipId, gid: claims.gymId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Null if the token is forged, expired, or not a pass. */
  async verify(token: string): Promise<PassClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.mid !== 'string' || typeof payload.gid !== 'string') return null;
      return { userId: payload.sub, membershipId: payload.mid, gymId: payload.gid };
    } catch {
      return null;
    }
  }
}
