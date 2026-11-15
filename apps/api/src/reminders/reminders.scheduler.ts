import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { RemindersService } from './reminders.service.js';

/** Checks for due renewal reminders every 15 minutes. Overlapping runs are skipped. */
@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  private running = false;

  constructor(
    private readonly reminders: RemindersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron('0 */15 * * * *', { name: 'renewal-reminders', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.config.get('REMINDERS_ENABLED', { infer: true }) || this.running) return;
    this.running = true;
    try {
      await this.reminders.sendDue();
    } catch (err) {
      this.logger.error(`Renewal reminder run failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
