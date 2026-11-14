import { Module } from '@nestjs/common';
import { FulfilmentRegistry } from './fulfilment.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaystackClient } from './paystack.client.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackClient, FulfilmentRegistry],
  exports: [PaystackClient, FulfilmentRegistry],
})
export class PaymentsModule {}
