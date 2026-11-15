import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { changeStaffRoleSchema, inviteStaffSchema, type GymStaffRole, type GymTeam, type InviteStaffInput, type MyInvitation } from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { StaffAccessService } from './staff-access.service.js';
import { TeamService } from './team.service.js';

const id = z.uuid();

@Controller()
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly access: StaffAccessService,
  ) {}

  @Get('staff/gyms/:gymId/team')
  async list(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string): Promise<GymTeam> {
    await this.access.require(user, gymId);
    return this.team.team(gymId, user.userId);
  }

  @Post('staff/gyms/:gymId/invitations')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  async invite(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: inviteStaffSchema }) body: InviteStaffInput): Promise<GymTeam> {
    const role = await this.access.require(user, gymId, ['owner', 'manager']);
    return this.team.invite(gymId, { userId: user.userId, role }, body.email, body.role);
  }

  @Delete('staff/gyms/:gymId/invitations/:invitationId')
  async revoke(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('invitationId', { schema: id }) invitationId: string): Promise<GymTeam> {
    const role = await this.access.require(user, gymId, ['owner', 'manager']);
    return this.team.revoke(gymId, { userId: user.userId, role }, invitationId);
  }

  @Patch('staff/gyms/:gymId/team/:userId')
  async changeRole(
    @CurrentUser() user: AccessClaims,
    @Param('gymId', { schema: id }) gymId: string,
    @Param('userId', { schema: id }) userId: string,
    @Body({ schema: changeStaffRoleSchema }) body: { role: GymStaffRole },
  ): Promise<GymTeam> {
    await this.access.require(user, gymId, ['owner']);
    return this.team.changeRole(gymId, user.userId, userId, body.role);
  }

  /** Remove someone, or leave the gym yourself. */
  @Delete('staff/gyms/:gymId/team/:userId')
  async remove(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('userId', { schema: id }) userId: string): Promise<GymTeam> {
    const role = await this.access.require(user, gymId);
    return this.team.remove(gymId, { userId: user.userId, role }, userId);
  }

  @Get('me/invitations')
  mine(@CurrentUser() user: AccessClaims): Promise<MyInvitation[]> {
    return this.team.myInvitations(user.userId);
  }

  @Post('me/invitations/:invitationId/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AccessClaims, @Param('invitationId', { schema: id }) invitationId: string): Promise<{ gymId: string }> {
    return this.team.respond(user.userId, invitationId, true);
  }

  @Post('me/invitations/:invitationId/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AccessClaims, @Param('invitationId', { schema: id }) invitationId: string): Promise<{ gymId: string }> {
    return this.team.respond(user.userId, invitationId, false);
  }
}
