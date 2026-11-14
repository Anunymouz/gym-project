import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Append-only record of security-relevant events. Never blocks the request if writing fails. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(event: {
    action: string;
    actorId?: string | null;
    targetType: string;
    targetId?: string | null;
    ipHash?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: event.action,
          actorId: event.actorId ?? null,
          targetType: event.targetType,
          targetId: event.targetId ?? null,
          ipHash: event.ipHash ?? null,
          ...(event.metadata !== undefined && { metadata: event.metadata }),
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed for ${event.action}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
