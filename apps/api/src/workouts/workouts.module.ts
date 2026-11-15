import { Module } from '@nestjs/common';
import { AdminExercisesController, AdminWorkoutsController, MyWorkoutsController, WorkoutsController } from './workouts.controller.js';
import { WorkoutsService } from './workouts.service.js';

@Module({
  controllers: [WorkoutsController, MyWorkoutsController, AdminExercisesController, AdminWorkoutsController],
  providers: [WorkoutsService],
})
export class WorkoutsModule {}
