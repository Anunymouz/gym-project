import { Module } from '@nestjs/common';
import { AdminReportsController } from './admin-reports.controller.js';
import { CommentsService } from './comments.service.js';
import { CommunityAccessService } from './community-access.service.js';
import { CommunityController } from './community.controller.js';
import { FeedController } from './feed.controller.js';
import { PostsService } from './posts.service.js';
import { StoriesService } from './stories.service.js';

@Module({
  controllers: [FeedController, CommunityController, AdminReportsController],
  providers: [PostsService, CommentsService, StoriesService, CommunityAccessService],
})
export class FeedModule {}
