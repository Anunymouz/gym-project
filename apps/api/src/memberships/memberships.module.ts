import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { CheckInsService } from './check-ins.service.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';
import { PassService } from './pass.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, CheckInsService, PassService],
})
export class MembershipsModule {}
