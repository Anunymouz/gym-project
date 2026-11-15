import { Global, Module } from '@nestjs/common';
import { RemindersScheduler } from './reminders.scheduler.js';
import { RemindersService } from './reminders.service.js';

@Global()
@Module({ providers: [RemindersService, RemindersScheduler], exports: [RemindersService] })
export class RemindersModule {}
