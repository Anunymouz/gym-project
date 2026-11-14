import { Controller, Get, Logger } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../auth/decorators.js';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  /** Liveness: the process is up. Used by the load balancer; never touches dependencies. */
  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies are reachable, so the instance can take traffic. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () =>
        this.checkDatabase(),
    ]);
  }

  /** Never expose driver errors (hosts, ports, queries) in the public response; log them instead. */
  private async checkDatabase() {
    const db = this.indicators.check('database');
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      return db.up();
    } catch (err) {
      this.logger.error(`Database health check failed: ${err instanceof Error ? err.message : String(err)}`);
      return db.down({ message: 'unavailable' });
    }
  }
}
