import { Module } from '@nestjs/common';
import { AdminGymsController } from './admin-gyms.controller.js';
import { AdminGymsService } from './admin-gyms.service.js';

@Module({ controllers: [AdminGymsController], providers: [AdminGymsService] })
export class AdminModule {}
