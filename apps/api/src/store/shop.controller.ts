import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  addressSchema,
  cartLineSchema,
  checkoutQuoteSchema,
  deliverySettingsSchema,
  orderActionSchema,
  storeCheckoutSchema,
  type AddressInput,
  type CartLineInput,
  type DeliverySettings,
  type OrderAction,
  type StoreCheckoutInput,
} from '@bgym/shared';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { AddressesService } from './addresses.service.js';
import { CartService } from './cart.service.js';
import { CheckoutService } from './checkout.service.js';
import { DeliveryService } from './delivery.service.js';
import { OrdersService } from './orders.service.js';
import { SellersService } from './sellers.service.js';

const id = z.uuid();
const filterQuery = z.object({ filter: z.enum(['open', 'done', 'all']).default('open') });

/** Members: cart, addresses, checkout and their orders. */
@Controller('me')
export class ShopController {
  constructor(
    private readonly cart: CartService,
    private readonly addresses: AddressesService,
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  @Get('cart')
  getCart(@CurrentUser() user: AccessClaims) {
    return this.cart.get(user.userId);
  }

  @Put('cart')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  setLine(@CurrentUser() user: AccessClaims, @Body({ schema: cartLineSchema }) body: CartLineInput) {
    return this.cart.set(user.userId, body.variantId, body.quantity);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AccessClaims) {
    return this.addresses.list(user.userId);
  }

  @Post('addresses')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  addAddress(@CurrentUser() user: AccessClaims, @Body({ schema: addressSchema }) body: AddressInput) {
    return this.addresses.create(user.userId, body);
  }

  @Put('addresses/:addressId')
  updateAddress(@CurrentUser() user: AccessClaims, @Param('addressId', { schema: id }) addressId: string, @Body({ schema: addressSchema }) body: AddressInput) {
    return this.addresses.update(user.userId, addressId, body);
  }

  @Post('addresses/:addressId/default')
  @HttpCode(HttpStatus.OK)
  defaultAddress(@CurrentUser() user: AccessClaims, @Param('addressId', { schema: id }) addressId: string) {
    return this.addresses.setDefault(user.userId, addressId);
  }

  @Delete('addresses/:addressId')
  removeAddress(@CurrentUser() user: AccessClaims, @Param('addressId', { schema: id }) addressId: string) {
    return this.addresses.remove(user.userId, addressId);
  }

  /** Delivery fees and totals for this address, before paying. */
  @Post('checkout/quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(@CurrentUser() user: AccessClaims, @Body({ schema: checkoutQuoteSchema }) body: { addressId: string }) {
    return this.checkout.quote(user.userId, body.addressId);
  }

  @Post('checkout')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  pay(@CurrentUser() user: AccessClaims, @Body({ schema: storeCheckoutSchema }) body: StoreCheckoutInput) {
    return this.checkout.checkout(user.userId, body);
  }

  @Get('orders')
  myOrders(@CurrentUser() user: AccessClaims) {
    return this.orders.mine(user.userId);
  }

  @Get('orders/:orderId')
  myOrder(@CurrentUser() user: AccessClaims, @Param('orderId', { schema: id }) orderId: string) {
    return this.orders.one(user.userId, orderId);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AccessClaims, @Param('orderId', { schema: id }) orderId: string) {
    return this.orders.cancelByMember(user.userId, orderId);
  }
}

/** Partners: their orders. */
@Controller('partner/orders')
@Roles('partner')
export class PartnerOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly sellers: SellersService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AccessClaims, @Query({ schema: filterQuery }) q: { filter: 'open' | 'done' | 'all' }) {
    return this.orders.forSeller(await this.sellers.partnerSellerId(user.userId), q.filter);
  }

  @Post(':orderId')
  @HttpCode(HttpStatus.OK)
  async act(@CurrentUser() user: AccessClaims, @Param('orderId', { schema: id }) orderId: string, @Body({ schema: orderActionSchema }) body: OrderAction) {
    return this.orders.act(await this.sellers.partnerSellerId(user.userId), user.userId, orderId, body);
  }
}

/** BGYM team: every order (BGYM's own and partners'), and delivery pricing. */
@Controller('admin/store')
@Roles('admin')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly delivery: DeliveryService,
  ) {}

  @Get('orders')
  list(@Query({ schema: filterQuery }) q: { filter: 'open' | 'done' | 'all' }) {
    return this.orders.forSeller(null, q.filter);
  }

  @Post('orders/:orderId')
  @HttpCode(HttpStatus.OK)
  act(@CurrentUser() user: AccessClaims, @Param('orderId', { schema: id }) orderId: string, @Body({ schema: orderActionSchema }) body: OrderAction) {
    return this.orders.act(null, user.userId, orderId, body);
  }

  @Get('delivery')
  settings() {
    return this.delivery.settings();
  }

  @Put('delivery')
  setSettings(@CurrentUser() user: AccessClaims, @Body({ schema: deliverySettingsSchema }) body: DeliverySettings) {
    return this.delivery.setSettings(user.userId, body);
  }
}
