import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

/**
 * Sends transactional email. Drivers:
 *  - log: prints to the server log (development only; refused in production by env validation)
 *  - memory: keeps messages in memory (tests)
 *  - resend: https://resend.com transactional email API
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Last message per recipient, for the memory driver (tests). */
  readonly outbox = new Map<string, MailMessage>();
  /** Every message, in order, for the memory driver (tests). */
  readonly sent: MailMessage[] = [];

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: MailMessage): Promise<void> {
    const driver = this.config.get('MAIL_DRIVER', { infer: true });
    if (driver === 'memory') {
      this.outbox.set(message.to, message);
      this.sent.push(message);
      return;
    }
    if (driver === 'log') {
      this.logger.warn(`[development email] to=${message.to} subject="${message.subject}"\n${message.text}`);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.get('RESEND_API_KEY', { infer: true })}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.config.get('MAIL_FROM', { infer: true }), ...message, to: [message.to] }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    } catch (err) {
      this.logger.error(`Email delivery failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("We couldn't send the email. Please try again in a moment.");
    } finally {
      clearTimeout(timer);
    }
  }
}
