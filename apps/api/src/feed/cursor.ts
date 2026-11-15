import { BadRequestException } from '@nestjs/common';

/** Cursor = "<createdAt ISO>|<id>", base64url: stable paging even when items share a timestamp. */
export const encodeCursor = (p: { createdAt: Date; id: string }) => Buffer.from(`${p.createdAt.toISOString()}|${p.id}`).toString('base64url');

export function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(at ?? '');
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/.test(id ?? '')) throw new BadRequestException('Invalid cursor');
  return { createdAt, id: id! };
}
