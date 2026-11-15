import { Module } from '@nestjs/common';
import { AdminReportsController } from './admin-reports.controller.js';
import { FeedController } from './feed.controller.js';
import { PostsService } from './posts.service.js';

@Module({ controllers: [FeedController, AdminReportsController], providers: [PostsService] })
export class FeedModule {}
