import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import {
  BODY_PARTS,
  completeSessionSchema,
  exerciseImportSchema,
  exerciseInputSchema,
  MAX_PHOTO_BYTES,
  workoutInputSchema,
  type CompleteSessionInput,
  type ExerciseImport,
  type ExerciseInput,
  type WorkoutInput,
} from '@bgym/shared';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { WorkoutsService } from './workouts.service.js';

const id = z.uuid();
const photo = () => FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 } });
const need = (file?: Express.Multer.File) => {
  if (!file) throw new BadRequestException('Choose a photo.');
  return file.buffer;
};
const exerciseQuery = z.object({
  q: z.string().trim().max(60).optional(),
  bodyPart: z.enum(Object.keys(BODY_PARTS) as [string, ...string[]]).optional(),
});
const activeSchema = z.object({ isActive: z.boolean() });
const publishSchema = z.object({ isPublished: z.boolean() });
const videoSchema = z.object({ videoId: z.uuid() });

/** Members: the workout library (free ones for everyone, the rest with any gym membership). */
@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get()
  home(@CurrentUser() user: AccessClaims) {
    return this.workouts.home(user.userId, user.roles);
  }

  @Get(':workoutId')
  detail(@CurrentUser() user: AccessClaims, @Param('workoutId', { schema: id }) workoutId: string) {
    return this.workouts.detail(user.userId, user.roles, workoutId);
  }

  @Post(':workoutId/sessions')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  complete(@CurrentUser() user: AccessClaims, @Param('workoutId', { schema: id }) workoutId: string, @Body({ schema: completeSessionSchema }) body: CompleteSessionInput) {
    return this.workouts.complete(user.userId, user.roles, workoutId, body);
  }
}

@Controller('me/workouts')
export class MyWorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get('history')
  history(@CurrentUser() user: AccessClaims) {
    return this.workouts.history(user.userId);
  }

  @Get('stats')
  stats(@CurrentUser() user: AccessClaims) {
    return this.workouts.stats(user.userId);
  }
}

/** The BGYM team: the exercise library. */
@Controller('admin/exercises')
@Roles('admin')
export class AdminExercisesController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get()
  list(@Query({ schema: exerciseQuery }) query: z.infer<typeof exerciseQuery>) {
    return this.workouts.exercises(query);
  }

  @Post()
  create(@CurrentUser() user: AccessClaims, @Body({ schema: exerciseInputSchema }) body: ExerciseInput) {
    return this.workouts.saveExercise(user.userId, null, body);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  import(@CurrentUser() user: AccessClaims, @Body({ schema: exerciseImportSchema }) body: ExerciseImport) {
    return this.workouts.importExercises(user.userId, body);
  }

  @Get(':exerciseId')
  get(@Param('exerciseId', { schema: id }) exerciseId: string) {
    return this.workouts.exercise(exerciseId);
  }

  @Put(':exerciseId')
  update(@CurrentUser() user: AccessClaims, @Param('exerciseId', { schema: id }) exerciseId: string, @Body({ schema: exerciseInputSchema }) body: ExerciseInput) {
    return this.workouts.saveExercise(user.userId, exerciseId, body);
  }

  @Patch(':exerciseId/active')
  active(@CurrentUser() user: AccessClaims, @Param('exerciseId', { schema: id }) exerciseId: string, @Body({ schema: activeSchema }) body: { isActive: boolean }) {
    return this.workouts.setExerciseActive(user.userId, exerciseId, body.isActive);
  }

  @Post(':exerciseId/photo')
  @UseInterceptors(photo())
  photo(@Param('exerciseId', { schema: id }) exerciseId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.workouts.setExercisePhoto(exerciseId, need(file));
  }

  @Post(':exerciseId/video')
  video(@CurrentUser() user: AccessClaims, @Param('exerciseId', { schema: id }) exerciseId: string, @Body({ schema: videoSchema }) body: { videoId: string }) {
    return this.workouts.setExerciseVideo(user.userId, exerciseId, body.videoId);
  }

  @Delete(':exerciseId/media')
  clearMedia(@Param('exerciseId', { schema: id }) exerciseId: string) {
    return this.workouts.clearExerciseMedia(exerciseId);
  }
}

/** The BGYM team: building and publishing workouts. */
@Controller('admin/workouts')
@Roles('admin')
export class AdminWorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get()
  list() {
    return this.workouts.adminWorkouts();
  }

  @Post()
  create(@CurrentUser() user: AccessClaims, @Body({ schema: workoutInputSchema }) body: WorkoutInput) {
    return this.workouts.saveWorkout(user.userId, null, body);
  }

  @Get(':workoutId')
  get(@Param('workoutId', { schema: id }) workoutId: string) {
    return this.workouts.adminWorkout(workoutId);
  }

  @Put(':workoutId')
  update(@CurrentUser() user: AccessClaims, @Param('workoutId', { schema: id }) workoutId: string, @Body({ schema: workoutInputSchema }) body: WorkoutInput) {
    return this.workouts.saveWorkout(user.userId, workoutId, body);
  }

  @Patch(':workoutId/publish')
  publish(@CurrentUser() user: AccessClaims, @Param('workoutId', { schema: id }) workoutId: string, @Body({ schema: publishSchema }) body: { isPublished: boolean }) {
    return this.workouts.publishWorkout(user.userId, workoutId, body.isPublished);
  }

  @Post(':workoutId/cover')
  @UseInterceptors(photo())
  cover(@Param('workoutId', { schema: id }) workoutId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.workouts.setWorkoutCover(workoutId, need(file));
  }

  @Delete(':workoutId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AccessClaims, @Param('workoutId', { schema: id }) workoutId: string) {
    return this.workouts.deleteWorkout(user.userId, workoutId);
  }
}
