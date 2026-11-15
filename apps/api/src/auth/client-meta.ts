import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip.js';
import type { ClientMeta } from './token.service.js';

/** User agent and a peppered hash of the client IP (raw IPs are never stored). */
export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): { userAgent?: string; ip: string } => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: clientIp(req), ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }) };
});

export type { ClientMeta };
