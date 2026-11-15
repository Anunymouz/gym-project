import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RemindersScheduler } from './reminders.scheduler.js';
import { RemindersService } from './reminders.service.js';

@Global()
@Module({ imports: [ScheduleModule.forRoot()], providers: [RemindersService, RemindersScheduler], exports: [RemindersService] })
export class RemindersModule {}
