import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { Receipt, ReceiptSummary } from '@bgym/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { ReceiptsService } from './receipts.service.js';

@Controller('me/payments')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  list(@CurrentUser() user: AccessClaims): Promise<ReceiptSummary[]> {
    return this.receipts.list(user.userId);
  }

  @Get(':paymentId')
  get(@CurrentUser() user: AccessClaims, @Param('paymentId', { schema: z.uuid() }) paymentId: string): Promise<Receipt> {
    return this.receipts.get(user.userId, paymentId);
  }
}
