import { Global, Module } from '@nestjs/common';
import { StaffAccessService } from './staff-access.service.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Global()
@Module({ controllers: [StaffController], providers: [StaffService, StaffAccessService], exports: [StaffAccessService] })
export class StaffModule {}
