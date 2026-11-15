import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import {
  availabilitySchema,
  bookSessionSchema,
  gymFeeOverrideSchema,
  inviteTrainerSchema,
  MAX_PHOTO_BYTES,
  timeOffSchema,
  trainerBookingActionSchema,
  trainerPackageSchema,
  trainerProfileSchema,
  updatePayoutSchema,
  type AvailabilityInput,
  type BookSessionInput,
  type TimeOffInput,
  type TrainerPackageInput,
  type TrainerProfileInput,
} from '@bgym/shared';
import { AuthService } from '../auth/auth.service.js';
import { Client } from '../auth/client-meta.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { PayoutsService } from '../staff/payouts.service.js';
import { StaffAccessService } from '../staff/staff-access.service.js';
import { BookingsService } from './bookings.service.js';
import { TrainersService } from './trainers.service.js';

const id = z.uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const listQuery = z.object({ gym: slug.optional() });
const slotsQuery = z.object({ from: z.iso.date(), days: z.coerce.number().int().min(1).max(14).default(7) });
const scopeQuery = z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') });
const monthQuery = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).optional() });

/** Members: find trainers, book sessions, buy packages, see and cancel their bookings. */
@Controller()
export class TrainersController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly bookings: BookingsService,
  ) {}

  @Get('trainers')
  list(@CurrentUser() user: AccessClaims, @Query({ schema: listQuery }) q: { gym?: string }) {
    return this.trainers.list(user.userId, q.gym);
  }

  @Get('trainers/:trainerId')
  detail(@CurrentUser() user: AccessClaims, @Param('trainerId', { schema: id }) trainerId: string) {
    return this.trainers.detail(user.userId, trainerId);
  }

  @Get('trainers/:trainerId/slots')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  slots(@Param('trainerId', { schema: id }) trainerId: string, @Query({ schema: slotsQuery }) q: { from: string; days: number }) {
    return this.trainers.slots(trainerId, q.from, q.days);
  }

  @Post('trainers/:trainerId/bookings')
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  book(@CurrentUser() user: AccessClaims, @Param('trainerId', { schema: id }) trainerId: string, @Body({ schema: bookSessionSchema }) body: BookSessionInput) {
    return this.bookings.book(user.userId, trainerId, body);
  }

  @Post('trainer-packages/:packageId/purchase')
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  buy(@CurrentUser() user: AccessClaims, @Param('packageId', { schema: id }) packageId: string) {
    return this.bookings.buyPackage(user.userId, packageId);
  }

  @Get('me/bookings')
  myBookings(@CurrentUser() user: AccessClaims) {
    return this.bookings.myBookings(user.userId);
  }

  @Post('me/bookings/:bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AccessClaims, @Param('bookingId', { schema: id }) bookingId: string) {
    return this.bookings.cancelByMember(user.userId, bookingId);
  }

  @Get('me/packages')
  myPackages(@CurrentUser() user: AccessClaims) {
    return this.trainers.myPackages(user.userId);
  }

  // ── Trainer invitations (anyone signed in with the invited email) ──
  @Get('me/trainer-invitations')
  invitations(@CurrentUser() user: AccessClaims) {
    return this.trainers.myInvitations(user.userId);
  }

  @Post('me/trainer-invitations/:invitationId/:answer')
  @HttpCode(HttpStatus.OK)
  respond(@CurrentUser() user: AccessClaims, @Param('invitationId', { schema: id }) invitationId: string, @Param('answer', { schema: z.enum(['accept', 'decline']) }) answer: 'accept' | 'decline') {
    return this.trainers.respond(user.userId, invitationId, answer === 'accept');
  }
}

/** The trainer dashboard. */
@Controller('trainer')
@Roles('trainer')
export class TrainerDashboardController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly bookings: BookingsService,
    private readonly payouts: PayoutsService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AccessClaims) {
    return this.trainers.me(user.userId);
  }

  @Put('me')
  update(@CurrentUser() user: AccessClaims, @Body({ schema: trainerProfileSchema }) body: TrainerProfileInput) {
    return this.trainers.updateProfile(user.userId, body);
  }

  @Post('me/photo')
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 } }))
  photo(@CurrentUser() user: AccessClaims, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Choose a photo.');
    return this.trainers.setPhoto(user.userId, file.buffer);
  }

  @Put('me/listed')
  listed(@CurrentUser() user: AccessClaims, @Body({ schema: z.object({ listed: z.boolean() }) }) body: { listed: boolean }) {
    return this.trainers.setListed(user.userId, body.listed);
  }

  @Get('availability')
  availability(@CurrentUser() user: AccessClaims) {
    return this.trainers.availability(user.userId);
  }

  @Put('availability')
  setAvailability(@CurrentUser() user: AccessClaims, @Body({ schema: availabilitySchema }) body: AvailabilityInput) {
    return this.trainers.setAvailability(user.userId, body);
  }

  @Post('time-off')
  addTimeOff(@CurrentUser() user: AccessClaims, @Body({ schema: timeOffSchema }) body: TimeOffInput) {
    return this.trainers.addTimeOff(user.userId, body);
  }

  @Delete('time-off/:timeOffId')
  removeTimeOff(@CurrentUser() user: AccessClaims, @Param('timeOffId', { schema: id }) timeOffId: string) {
    return this.trainers.removeTimeOff(user.userId, timeOffId);
  }

  @Get('packages')
  packages(@CurrentUser() user: AccessClaims) {
    return this.trainers.packages(user.userId);
  }

  @Post('packages')
  createPackage(@CurrentUser() user: AccessClaims, @Body({ schema: trainerPackageSchema }) body: TrainerPackageInput) {
    return this.trainers.createPackage(user.userId, body);
  }

  @Patch('packages/:packageId')
  updatePackage(@CurrentUser() user: AccessClaims, @Param('packageId', { schema: id }) packageId: string, @Body({ schema: z.object({ isActive: z.boolean() }) }) body: { isActive: boolean }) {
    return this.trainers.updatePackage(user.userId, packageId, body);
  }

  @Get('bookings')
  bookingsList(@CurrentUser() user: AccessClaims, @Query({ schema: scopeQuery }) q: { scope: 'upcoming' | 'past' }) {
    return this.bookings.trainerBookings(user.userId, q.scope);
  }

  @Post('bookings/:bookingId')
  @HttpCode(HttpStatus.OK)
  act(@CurrentUser() user: AccessClaims, @Param('bookingId', { schema: id }) bookingId: string, @Body({ schema: trainerBookingActionSchema }) body: { action: 'complete' | 'no_show' | 'cancel' }) {
    return this.bookings.trainerAction(user.userId, bookingId, body.action);
  }

  @Get('clients')
  clients(@CurrentUser() user: AccessClaims) {
    return this.bookings.clients(user.userId);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: AccessClaims, @Query({ schema: monthQuery }) q: { month?: string }) {
    return this.bookings.earnings(user.userId, q.month);
  }

  @Get('payout')
  async payout(@CurrentUser() user: AccessClaims) {
    return this.payouts.trainerPayout((await this.trainers.requireTrainer(user.userId)).id);
  }

  @Get('payout/banks')
  banks() {
    return this.payouts.banks();
  }

  /** Emails the trainer a code that confirms a payout change. */
  @Post('payout/code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async payoutCode(@CurrentUser() user: AccessClaims, @Client() client: { ip: string }): Promise<void> {
    await this.trainers.requireTrainer(user.userId);
    await this.payouts.requestCode(user.userId, this.auth.hashIp(client.ip));
  }

  @Put('payout')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  async updatePayout(@CurrentUser() user: AccessClaims, @Body({ schema: updatePayoutSchema }) body: z.output<typeof updatePayoutSchema>) {
    const t = await this.trainers.requireTrainer(user.userId);
    return this.payouts.updateTrainer(t.id, user.userId, body);
  }
}

/** Gyms: invite and remove their trainers. */
@Controller('staff/gyms/:gymId')
export class GymTrainersController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly bookings: BookingsService,
    private readonly access: StaffAccessService,
  ) {}

  @Get('trainers')
  async list(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string) {
    await this.access.require(user, gymId);
    return this.trainers.gymTrainers(gymId);
  }

  @Post('trainer-invitations')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  async invite(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Body({ schema: inviteTrainerSchema }) body: { email: string }) {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.trainers.invite(gymId, user.userId, body.email);
  }

  @Delete('trainer-invitations/:invitationId')
  async revoke(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('invitationId', { schema: id }) invitationId: string) {
    await this.access.require(user, gymId, ['owner', 'manager']);
    return this.trainers.revokeInvitation(gymId, user.userId, invitationId);
  }

  /** Unlinks the trainer from the gym and cancels their upcoming sessions (members are refunded). */
  @Post('trainers/:trainerId/remove')
  async remove(@CurrentUser() user: AccessClaims, @Param('gymId', { schema: id }) gymId: string, @Param('trainerId', { schema: id }) trainerId: string) {
    await this.access.require(user, gymId, ['owner', 'manager']);
    await this.trainers.suspend(trainerId, user.userId, 'gym.trainer_removed', gymId);
    await this.bookings.cancelAllUpcoming(trainerId, user.userId);
    return this.trainers.gymTrainers(gymId);
  }
}

/** BGYM team: every trainer, pause or restore, special fee. */
@Controller('admin/trainers')
@Roles('admin')
export class AdminTrainersController {
  constructor(
    private readonly trainers: TrainersService,
    private readonly bookings: BookingsService,
  ) {}

  @Get()
  list() {
    return this.trainers.adminList();
  }

  @Post(':trainerId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(@CurrentUser() user: AccessClaims, @Param('trainerId', { schema: id }) trainerId: string): Promise<void> {
    await this.trainers.suspend(trainerId, user.userId, 'trainer.suspended');
    await this.bookings.cancelAllUpcoming(trainerId, user.userId);
  }

  @Post(':trainerId/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@CurrentUser() user: AccessClaims, @Param('trainerId', { schema: id }) trainerId: string): Promise<void> {
    await this.trainers.reactivate(trainerId, user.userId);
  }

  @Put(':trainerId/fee')
  @HttpCode(HttpStatus.NO_CONTENT)
  async fee(@CurrentUser() user: AccessClaims, @Param('trainerId', { schema: id }) trainerId: string, @Body({ schema: gymFeeOverrideSchema }) body: { bps: number | null }): Promise<void> {
    await this.trainers.setFee(trainerId, body.bps, user.userId);
  }
}
