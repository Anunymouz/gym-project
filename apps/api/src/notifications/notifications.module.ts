import { Global, Module } from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service.js';
import { NotificationsController } from './notifications.controller.js';
import { PushService } from './push.service.js';
import { UnsubscribeService } from './unsubscribe.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationSettingsService, PushService, UnsubscribeService],
  exports: [NotificationSettingsService, PushService, UnsubscribeService],
})
export class NotificationsModule {}
