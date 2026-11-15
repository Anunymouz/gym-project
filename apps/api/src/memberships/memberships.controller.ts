import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  checkInByEmailSchema,
  checkInSchema,
  checkoutSchema,
  type CheckInByEmailInput,
  type CheckInInput,
  type CheckInResponse,
  type CheckoutInput,
  type CheckoutResponse,
  type MembershipPass,
  type MembershipSummary,
} from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { CheckInsService } from './check-ins.service.js';
import { MembershipsService } from './memberships.service.js';

const idSchema = z.uuid();

@Controller()
export class MembershipsController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly checkIns: CheckInsService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('memberships/checkout')
  checkout(@CurrentUser() user: AccessClaims, @Body({ schema: checkoutSchema }) body: CheckoutInput): Promise<CheckoutResponse> {
    return this.memberships.checkout(user.userId, body.planId);
  }

  @Get('memberships')
  mine(@CurrentUser() user: AccessClaims): Promise<MembershipSummary[]> {
    return this.memberships.listForUser(user.userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('memberships/:id/pass')
  pass(@CurrentUser() user: AccessClaims, @Param('id', { schema: idSchema }) id: string): Promise<MembershipPass> {
    return this.memberships.passFor(user.userId, id);
  }

  @Post('check-ins')
  @HttpCode(HttpStatus.OK)
  checkIn(@CurrentUser() user: AccessClaims, @Body({ schema: checkInSchema }) body: CheckInInput): Promise<CheckInResponse> {
    return this.checkIns.checkIn(user, body.gymId, body.token);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('check-ins/by-email')
  @HttpCode(HttpStatus.OK)
  checkInByEmail(@CurrentUser() user: AccessClaims, @Body({ schema: checkInByEmailSchema }) body: CheckInByEmailInput): Promise<CheckInResponse> {
    return this.checkIns.checkInByEmail(user, body.gymId, body.email);
  }
}
