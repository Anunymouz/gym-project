import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { GymApplicationsService } from './gym-applications.service.js';
import { PayoutsService } from './payouts.service.js';
import { GymApplicationsController } from './gym-applications.controller.js';
import { StaffAccessService } from './staff-access.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Global()
@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [StaffController, GymApplicationsController], providers: [StaffService, StaffAccessService, GymApplicationsService, PayoutsService], exports: [StaffAccessService] })
export class StaffModule {}
