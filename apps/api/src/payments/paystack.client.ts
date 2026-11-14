import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';

export interface PaystackTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
}

/** Minimal Paystack API client: https://paystack.com/docs/api/transaction */
@Injectable()
export class PaystackClient {
  private readonly logger = new Logger(PaystackClient.name);
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get secret(): string | undefined {
    return this.config.get('PAYSTACK_SECRET_KEY', { infer: true });
  }

  async initialize(input: {
    reference: string;
    email: string;
    amountPesewas: number;
    subaccount?: string | null;
    platformFeePesewas?: number;
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string }> {
    const body = {
      reference: input.reference,
      email: input.email,
      amount: input.amountPesewas, // GHS amounts are sent in pesewas
      currency: 'GHS',
      channels: ['mobile_money', 'card'],
      callback_url: this.config.get('PAYSTACK_CALLBACK_URL', { infer: true }),
      metadata: input.metadata,
      // Split: the gym's subaccount receives the payment minus BGYM's fee; the gym bears Paystack's charges.
      ...(input.subaccount && { subaccount: input.subaccount, transaction_charge: input.platformFeePesewas ?? 0, bearer: 'subaccount' }),
    };
    const data = await this.call<{ authorization_url: string }>('POST', '/transaction/initialize', body);
    return { authorizationUrl: data.authorization_url };
  }

  verify(reference: string): Promise<PaystackTransaction> {
    return this.call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  /** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
  isValidSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!this.secret || !signature) return false;
    const expected = createHmac('sha512', this.secret).update(rawBody).digest();
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`https://api.paystack.co${path}`, {
        method,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const json = (await res.json()) as { status: boolean; message: string; data: T };
      if (!res.ok || !json.status) throw new Error(`${res.status} ${json.message}`);
      return json.data;
    } catch (err) {
      this.logger.error(`Paystack ${method} ${path.split('/').slice(0, 3).join('/')} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadGatewayException('We couldn’t reach the payment provider. Please try again.');
    } finally {
      clearTimeout(timer);
    }
  }
}
