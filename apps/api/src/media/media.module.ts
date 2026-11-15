import { Global, Module } from '@nestjs/common';
import { GymPhotosController } from './gym-photos.controller.js';
import { GymPhotosService } from './gym-photos.service.js';
import { MediaController } from './media.controller.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({ controllers: [MediaController, GymPhotosController], providers: [StorageService, GymPhotosService], exports: [StorageService, GymPhotosService] })
export class MediaModule {}
