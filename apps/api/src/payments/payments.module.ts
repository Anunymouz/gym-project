import { Module } from '@nestjs/common';
import { FulfilmentRegistry } from './fulfilment.js';
import { PaymentsController } from './payments.controller.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';
import { PaymentsService } from './payments.service.js';
import { PaystackClient } from './paystack.client.js';
import { RefundsService } from './refunds.service.js';

@Module({
  controllers: [PaymentsController, ReceiptsController],
  providers: [PaymentsService, PaystackClient, FulfilmentRegistry, ReceiptsService, RefundsService],
  exports: [PaystackClient, FulfilmentRegistry, RefundsService],
})
export class PaymentsModule {}
