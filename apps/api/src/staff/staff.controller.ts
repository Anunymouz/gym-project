import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createPlanSchema,
  membersQuerySchema,
  updatePlanSchema,
  type CreatePlanInput,
  type GymMember,
  type GymOverview,
  type MembersQuery,
  type StaffGym,
  type StaffPlan,
  type UpdatePlanInput,
} from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StaffAccessService } from './staff-access.service.js';
import { StaffService } from './staff.service.js';

const id = z.uuid();

/** Gym dashboard API. Every route checks the caller is staff at that gym. */
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly access: StaffAccessService,
  ) {}

  @Get('gyms')
  gyms(@CurrentUser() user: AccessClaims): Promise<StaffGym[]> {
    return this.staff.gymsFor(user.userId);
  }

  @Get('gyms/:gymId/overview')
  async overview(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<GymOverview> {
    await this.access.require(user, gymId);
    return this.staff.overview(gymId);
  }

  @Get('gyms/:gymId/members')
  async members(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Query({ schema: membersQuerySchema }) query: MembersQuery): Promise<GymMember[]> {
    await this.access.require(user, gymId);
    return this.staff.members(gymId, query);
  }

  @Get('gyms/:gymId/plans')
  async plans(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<StaffPlan[]> {
    await this.access.require(user, gymId);
    return this.staff.plans(gymId);
  }

  @Post('gyms/:gymId/plans')
  async createPlan(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: createPlanSchema }) body: CreatePlanInput): Promise<StaffPlan> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.staff.createPlan(gymId, user.userId, body);
  }

  @Patch('gyms/:gymId/plans/:planId')
  async updatePlan(
    @CurrentUser() user: AccessClaims,
    @Param('gymId', { schema: id }) gymId: string,
    @Param('planId', { schema: id }) planId: string,
    @Body({ schema: updatePlanSchema }) body: UpdatePlanInput,
  ): Promise<StaffPlan> {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.staff.updatePlan(gymId, planId, user.userId, body);
  }
}
