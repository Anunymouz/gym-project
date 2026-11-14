import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';

@SkipThrottle()
@Controller('health')
export class HealthController {
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
        this.indicators
          .check('database')
          .attempt(async () => {
            await this.prisma.$queryRaw`SELECT 1`;
          })
          .withTimeout(2000),
    ]);
  }
}
