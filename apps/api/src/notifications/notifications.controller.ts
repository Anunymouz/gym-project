import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Put, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  NOTIFICATION_TOPICS,
  registerDeviceSchema,
  unregisterDeviceSchema,
  unsubscribeSchema,
  updateNotificationSettingSchema,
  type NotificationSettings,
  type RegisterDeviceInput,
  type UnsubscribeResponse,
  type UpdateNotificationSetting,
} from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Public } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { PushService } from './push.service.js';
import { UnsubscribeService } from './unsubscribe.service.js';

@Controller()
export class NotificationsController {
  constructor(
    private readonly settings: NotificationSettingsService,
    private readonly push: PushService,
    private readonly unsubscribes: UnsubscribeService,
    private readonly audit: AuditService,
  ) {}

  @Get('me/notifications')
  get(@CurrentUser() user: AccessClaims): Promise<NotificationSettings> {
    return this.settings.get(user.userId);
  }

  @Patch('me/notifications')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  update(@CurrentUser() user: AccessClaims, @Body({ schema: updateNotificationSettingSchema }) body: UpdateNotificationSetting): Promise<NotificationSettings> {
    return this.settings.set(user.userId, body);
  }

  /** Called by the app when it has push permission (and on each launch, to keep the token fresh). */
  @Put('me/devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async register(@CurrentUser() user: AccessClaims, @Body({ schema: registerDeviceSchema }) body: RegisterDeviceInput): Promise<void> {
    await this.push.register(user.userId, body);
  }

  /** Called by the app on sign-out, so this phone stops getting the person's notifications. */
  @Post('me/devices/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(@CurrentUser() user: AccessClaims, @Body({ schema: unregisterDeviceSchema }) body: { token: string }): Promise<void> {
    await this.push.unregister(user.userId, body.token);
  }

  /** From the link in an email: turns that topic's emails off. No sign-in needed. */
  @Public()
  @Post('notifications/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async unsubscribe(@Body({ schema: unsubscribeSchema }) body: { token: string }): Promise<UnsubscribeResponse> {
    const claims = await this.unsubscribes.verify(body.token);
    if (!claims) throw new UnauthorizedException('This link is not valid. Change your email settings in the BGYM app instead.');
    await this.settings.set(claims.userId, { topic: claims.topic, channel: 'email', enabled: false }).catch(() => undefined); // account may be gone
    await this.audit.record({ action: 'notifications.unsubscribed', actorId: claims.userId, targetType: 'user', targetId: claims.userId, metadata: { topic: claims.topic } });
    return { topic: claims.topic, label: NOTIFICATION_TOPICS[claims.topic].label };
  }
}
