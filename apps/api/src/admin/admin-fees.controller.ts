import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  adminPaymentsQuerySchema,
  gymFeeOverrideSchema,
  updateFeeSettingsSchema,
  type AdminPaymentsMonth,
  type FeeSettings,
  type GymFee,
  type UpdateFeeSettingsInput,
} from '@bgym/shared';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { FeesService } from '../fees/fees.service.js';
import { AdminPaymentsService } from './admin-payments.service.js';

const id = z.uuid();

/** BGYM team only: the platform fee and what BGYM has earned. */
@Controller('admin')
@Roles('admin')
export class AdminFeesController {
  constructor(
    private readonly fees: FeesService,
    private readonly payments: AdminPaymentsService,
  ) {}

  @Get('fees')
  settings(): Promise<FeeSettings> {
    return this.fees.settings();
  }

  @Put('fees')
  update(@CurrentUser() user: AccessClaims, @Body({ schema: updateFeeSettingsSchema }) body: UpdateFeeSettingsInput): Promise<FeeSettings> {
    return this.fees.setDefault(body, user.userId);
  }

  @Put('gyms/:gymId/fee')
  gymFee(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: gymFeeOverrideSchema }) body: { bps: number | null }): Promise<GymFee> {
    return this.fees.setGymOverride(gymId, body.bps, user.userId);
  }

  @Get('payments')
  month(@Query({ schema: adminPaymentsQuerySchema }) query: { month?: string }): Promise<AdminPaymentsMonth> {
    return this.payments.month(query.month);
  }
}
