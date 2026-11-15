import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CatalogueService } from './catalogue.service.js';
import { ProductsService } from './products.service.js';
import { SellersService } from './sellers.service.js';
import { AddressesService } from './addresses.service.js';
import { CartService } from './cart.service.js';
import { CheckoutService } from './checkout.service.js';
import { DeliveryService } from './delivery.service.js';
import { OrderNotifier } from './order-notifier.service.js';
import { OrdersService } from './orders.service.js';
import { AdminOrdersController, PartnerOrdersController, ShopController } from './shop.controller.js';
import { AdminStoreController, PartnerController, StoreController } from './store.controller.js';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [StoreController, PartnerController, AdminStoreController, ShopController, PartnerOrdersController, AdminOrdersController],
  providers: [CatalogueService, ProductsService, SellersService, CartService, AddressesService, DeliveryService, CheckoutService, OrdersService, OrderNotifier],
  exports: [CatalogueService, SellersService],
})
export class StoreModule {}
