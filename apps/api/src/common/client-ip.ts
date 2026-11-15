import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/**
 * The dashboard's server calls this API for its visitors. Without help, every gym's staff
 * would look like one client (the dashboard server), sharing one rate-limit bucket. The
 * dashboard therefore passes the visitor's IP in CLIENT_IP_HEADER, and proves it is the
 * dashboard with a shared secret. The header is ignored from anyone else, so a client
 * cannot pick its own IP to dodge rate limits.
 */
export const CLIENT_IP_HEADER = 'x-bgym-client-ip';
export const PROXY_SECRET_HEADER = 'x-bgym-proxy-secret';

type WithClientIp = Request & { clientIp?: string };

const digest = (value: string) => createHash('sha256').update(value).digest();

export function clientIpMiddleware(secret: string | undefined) {
  const expected = secret ? digest(secret) : null;
  return (req: Request, _res: Response, next: NextFunction) => {
    let ip = req.ip ?? 'unknown';
    const given = req.headers[PROXY_SECRET_HEADER];
    const claimed = req.headers[CLIENT_IP_HEADER];
    if (expected && typeof given === 'string' && typeof claimed === 'string' && isIP(claimed) && timingSafeEqual(digest(given), expected)) {
      ip = claimed;
    }
    (req as WithClientIp).clientIp = ip;
    next();
  };
}

/** The real client's IP for rate limits and (hashed) audit records. */
export function clientIp(req: Request): string {
  return (req as WithClientIp).clientIp ?? req.ip ?? 'unknown';
}
