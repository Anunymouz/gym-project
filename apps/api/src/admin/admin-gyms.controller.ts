import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { adminGymsQuerySchema, reviewGymSchema, suspendGymSchema, type AdminGym, type ReviewGymInput } from '@bgym/shared';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { AdminGymsService } from './admin-gyms.service.js';

const id = z.uuid();

/** BGYM team only. */
@Controller('admin/gyms')
@Roles('admin')
export class AdminGymsController {
  constructor(private readonly gyms: AdminGymsService) {}

  @Get()
  list(@Query({ schema: adminGymsQuerySchema }) query: z.output<typeof adminGymsQuerySchema>): Promise<AdminGym[]> {
    return this.gyms.list(query.status, query.q);
  }

  @Get(':gymId')
  get(@Param('gymId', { schema: id }) gymId: string): Promise<AdminGym> {
    return this.gyms.get(gymId);
  }

  @Post(':gymId/review')
  @HttpCode(HttpStatus.OK)
  review(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: reviewGymSchema }) body: ReviewGymInput): Promise<AdminGym> {
    return this.gyms.review(gymId, user.userId, body);
  }

  @Post(':gymId/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: suspendGymSchema }) body: { reason: string }): Promise<AdminGym> {
    return this.gyms.suspend(gymId, user.userId, body.reason);
  }

  @Post(':gymId/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<AdminGym> {
    return this.gyms.reactivate(gymId, user.userId);
  }
}
