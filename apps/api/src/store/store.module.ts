import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CatalogueService } from './catalogue.service.js';
import { ProductsService } from './products.service.js';
import { SellersService } from './sellers.service.js';
import { AdminStoreController, PartnerController, StoreController } from './store.controller.js';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [StoreController, PartnerController, AdminStoreController],
  providers: [CatalogueService, ProductsService, SellersService],
  exports: [CatalogueService, SellersService],
})
export class StoreModule {}
