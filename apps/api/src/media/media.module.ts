import { Global, Module } from '@nestjs/common';
import { GymPhotosController } from './gym-photos.controller.js';
import { GymPhotosService } from './gym-photos.service.js';
import { MediaController } from './media.controller.js';
import { StorageService } from './storage.service.js';
import { VideoService } from './video.service.js';
import { VideosController } from './videos.controller.js';

@Global()
@Module({ controllers: [MediaController, GymPhotosController, VideosController], providers: [StorageService, GymPhotosService, VideoService], exports: [StorageService, GymPhotosService, VideoService] })
export class MediaModule {}
