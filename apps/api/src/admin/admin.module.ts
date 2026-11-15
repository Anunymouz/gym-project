import { Module } from '@nestjs/common';
import { AdminFeesController } from './admin-fees.controller.js';
import { AdminGymsController } from './admin-gyms.controller.js';
import { AdminPaymentsService } from './admin-payments.service.js';
import { AdminGymsService } from './admin-gyms.service.js';

@Module({ controllers: [AdminGymsController, AdminFeesController], providers: [AdminGymsService, AdminPaymentsService] })
export class AdminModule {}
