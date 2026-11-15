import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BookingsService } from './bookings.service.js';
import { AdminTrainersController, GymTrainersController, TrainerDashboardController, TrainersController } from './trainers.controller.js';
import { TrainersService } from './trainers.service.js';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [TrainersController, TrainerDashboardController, GymTrainersController, AdminTrainersController],
  providers: [TrainersService, BookingsService],
})
export class TrainersModule {}
