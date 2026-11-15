import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { applyGymSchema, updatePayoutSchema, type GymApplicationResponse, type GymPayout, type GymReadiness, type PayoutBank } from '@bgym/shared';
import { AuthService } from '../auth/auth.service.js';
import { Client } from '../auth/client-meta.js';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { GymApplicationsService } from './gym-applications.service.js';
import { PayoutsService } from './payouts.service.js';
import { StaffAccessService } from './staff-access.service.js';

const id = z.uuid();

@Controller()
export class GymApplicationsController {
  constructor(
    private readonly applications: GymApplicationsService,
    private readonly access: StaffAccessService,
    private readonly payouts: PayoutsService,
    private readonly auth: AuthService,
  ) {}

  /** "List your gym": creates a draft gym with the caller as its owner. */
  @Post('gyms/applications')
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  apply(@CurrentUser() user: AccessClaims, @Body({ schema: applyGymSchema }) body: z.output<typeof applyGymSchema>): Promise<GymApplicationResponse> {
    return this.applications.apply(user.userId, body);
  }

  @Get('staff/gyms/:gymId/readiness')
  async readiness(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<GymReadiness> {
    await this.access.require(user, gymId);
    return this.applications.readiness(gymId);
  }

  /** Sends the gym to the BGYM team. Owners only. */
  @Post('staff/gyms/:gymId/submit')
  @HttpCode(HttpStatus.OK)
  async submit(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<GymReadiness> {
    await this.access.require(user, gymId, ['owner']);
    return this.applications.submit(gymId, user.userId);
  }

  /** Banks and mobile money providers a gym can be paid to. */
  @Get('payouts/banks')
  banks(): Promise<PayoutBank[]> {
    return this.payouts.banks();
  }

  /** Payout account (masked). Owners only: managers and front desk never see it. */
  @Get('staff/gyms/:gymId/payout')
  async payout(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<GymPayout> {
    await this.access.require(user, gymId, ['owner']);
    return this.payouts.get(gymId);
  }

  /** Emails the owner a code to confirm a payout change. */
  @Post('staff/gyms/:gymId/payout/code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async payoutCode(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Client() client: { ip: string }): Promise<void> {
    await this.access.require(user, gymId, ['owner']);
    await this.payouts.requestCode(user.userId, this.auth.hashIp(client.ip));
  }

  @Put('staff/gyms/:gymId/payout')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  async updatePayout(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: updatePayoutSchema }) body: z.output<typeof updatePayoutSchema>): Promise<GymPayout> {
    await this.access.require(user, gymId, ['owner']);
    return this.payouts.update(gymId, user.userId, body);
  }
}
