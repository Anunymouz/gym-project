import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import {
  createPartnerSchema,
  MAX_PHOTO_BYTES,
  pickupLocationSchema,
  productInputSchema,
  productReviewSchema,
  productStatusActionSchema,
  stockAdjustSchema,
  storeQuerySchema,
  updatePayoutSchema,
  type CreatePartnerInput,
  type PickupLocationInput,
  type ProductInput,
  type StoreQuery,
} from '@bgym/shared';
import { AuthService } from '../auth/auth.service.js';
import { Client } from '../auth/client-meta.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AccessClaims } from '../auth/token.service.js';
import { PayoutsService } from '../staff/payouts.service.js';
import { CatalogueService } from './catalogue.service.js';
import { ProductsService } from './products.service.js';
import { SellersService } from './sellers.service.js';

const id = z.uuid();
const photo = () => FileInterceptor('photo', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 } });
const need = (file?: Express.Multer.File) => {
  if (!file) throw new BadRequestException('Choose a photo.');
  return file.buffer;
};

/** The BGYM Store for members: browse and search (shopping never needs a gym). */
@Controller('store')
export class StoreController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('categories')
  categories() {
    return this.catalogue.categories();
  }

  @Get('products')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  products(@Query({ schema: storeQuerySchema }) query: StoreQuery) {
    return this.catalogue.list(query);
  }

  @Get('products/:productId')
  product(@Param('productId', { schema: id }) productId: string) {
    return this.catalogue.product(productId);
  }
}

/** The store partner dashboard: their account, products and (in orders) their sales. */
@Controller('partner')
@Roles('partner')
export class PartnerController {
  constructor(
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
    private readonly payouts: PayoutsService,
    private readonly auth: AuthService,
  ) {}

  private seller(user: AccessClaims) {
    return this.sellers.partnerSellerId(user.userId);
  }

  @Get('me')
  async me(@CurrentUser() user: AccessClaims) {
    return this.sellers.account(await this.seller(user));
  }

  @Put('pickup')
  async pickup(@CurrentUser() user: AccessClaims, @Body({ schema: pickupLocationSchema }) body: PickupLocationInput) {
    return this.sellers.setPickup(await this.seller(user), user.userId, body);
  }

  @Get('payout')
  async payout(@CurrentUser() user: AccessClaims) {
    return this.payouts.sellerPayout(await this.seller(user));
  }

  @Get('payout/banks')
  banks() {
    return this.payouts.banks();
  }

  @Post('payout/code')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async payoutCode(@CurrentUser() user: AccessClaims, @Client() client: { ip: string }): Promise<void> {
    await this.seller(user);
    await this.payouts.requestCode(user.userId, this.auth.hashIp(client.ip));
  }

  @Put('payout')
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  async updatePayout(@CurrentUser() user: AccessClaims, @Body({ schema: updatePayoutSchema }) body: z.output<typeof updatePayoutSchema>) {
    return this.payouts.updateSeller(await this.seller(user), user.userId, body);
  }

  @Get('products')
  async list(@CurrentUser() user: AccessClaims) {
    return this.products.list(await this.seller(user));
  }

  @Get('products/:productId')
  async get(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string) {
    return this.products.get(await this.seller(user), productId);
  }

  @Post('products')
  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  async create(@CurrentUser() user: AccessClaims, @Body({ schema: productInputSchema }) body: ProductInput) {
    return this.products.create(await this.seller(user), user.userId, body);
  }

  @Put('products/:productId')
  async update(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Body({ schema: productInputSchema }) body: ProductInput) {
    return this.products.update(await this.seller(user), user.userId, productId, body);
  }

  @Post('products/:productId/status')
  @HttpCode(HttpStatus.OK)
  async status(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Body({ schema: productStatusActionSchema }) body: { action: 'publish' | 'unpublish' | 'archive' }) {
    return this.products.setStatus(await this.seller(user), user.userId, productId, body.action);
  }

  @Put('variants/:variantId/stock')
  async stock(@CurrentUser() user: AccessClaims, @Param('variantId', { schema: id }) variantId: string, @Body({ schema: stockAdjustSchema }) body: { stock: number }) {
    return this.products.setStock(await this.seller(user), user.userId, variantId, body.stock);
  }

  @Post('products/:productId/photos')
  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  @UseInterceptors(photo())
  async addPhoto(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.products.addPhoto(await this.seller(user), productId, need(file));
  }

  @Delete('products/:productId/photos/:imageId')
  async removePhoto(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Param('imageId', { schema: id }) imageId: string) {
    return this.products.removePhoto(await this.seller(user), productId, imageId);
  }

  @Post('products/:productId/photos/:imageId/cover')
  @HttpCode(HttpStatus.OK)
  async cover(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Param('imageId', { schema: id }) imageId: string) {
    return this.products.makeCover(await this.seller(user), productId, imageId);
  }
}

/** BGYM team: partners, the review queue, and BGYM's own products. */
@Controller('admin/store')
@Roles('admin')
export class AdminStoreController {
  constructor(
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
  ) {}

  @Get('sellers')
  list() {
    return this.sellers.list();
  }

  @Post('partners')
  createPartner(@CurrentUser() user: AccessClaims, @Body({ schema: createPartnerSchema }) body: CreatePartnerInput) {
    return this.sellers.createPartner(user.userId, body);
  }

  @Patch('partners/:sellerId')
  updatePartner(@CurrentUser() user: AccessClaims, @Param('sellerId', { schema: id }) sellerId: string, @Body({ schema: z.object({ commissionBps: z.number().int().min(0).max(5000).optional(), isActive: z.boolean().optional() }) }) body: { commissionBps?: number; isActive?: boolean }) {
    return this.sellers.updatePartner(user.userId, sellerId, body);
  }

  @Get('review')
  review() {
    return this.products.pendingReview();
  }

  @Post('review/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async decide(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Body({ schema: productReviewSchema }) body: { decision: 'approve' } | { decision: 'reject'; note: string }): Promise<void> {
    await this.products.review(user.userId, productId, body);
  }

  @Put('products/:productId/featured')
  @HttpCode(HttpStatus.NO_CONTENT)
  async featured(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Body({ schema: z.object({ isFeatured: z.boolean() }) }) body: { isFeatured: boolean }): Promise<void> {
    await this.products.setFeatured(user.userId, productId, body.isFeatured);
  }

  // ── BGYM's own store ──
  @Get('own')
  async own() {
    return this.sellers.account(await this.sellers.platformSellerId());
  }

  @Put('own/pickup')
  async ownPickup(@CurrentUser() user: AccessClaims, @Body({ schema: pickupLocationSchema }) body: PickupLocationInput) {
    return this.sellers.setPickup(await this.sellers.platformSellerId(), user.userId, body);
  }

  @Get('own/products')
  async ownProducts() {
    return this.products.list(await this.sellers.platformSellerId());
  }

  @Get('own/products/:productId')
  async ownProduct(@Param('productId', { schema: id }) productId: string) {
    return this.products.get(await this.sellers.platformSellerId(), productId);
  }

  @Post('own/products')
  async createOwn(@CurrentUser() user: AccessClaims, @Body({ schema: productInputSchema }) body: ProductInput) {
    return this.products.create(await this.sellers.platformSellerId(), user.userId, body);
  }

  @Put('own/products/:productId')
  async updateOwn(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Body({ schema: productInputSchema }) body: ProductInput) {
    return this.products.update(await this.sellers.platformSellerId(), user.userId, productId, body);
  }

  @Post('own/products/:productId/status')
  @HttpCode(HttpStatus.OK)
  async ownStatus(@CurrentUser() user: AccessClaims, @Param('productId', { schema: id }) productId: string, @Body({ schema: productStatusActionSchema }) body: { action: 'publish' | 'unpublish' | 'archive' }) {
    return this.products.setStatus(await this.sellers.platformSellerId(), user.userId, productId, body.action);
  }

  @Put('own/variants/:variantId/stock')
  async ownStock(@CurrentUser() user: AccessClaims, @Param('variantId', { schema: id }) variantId: string, @Body({ schema: stockAdjustSchema }) body: { stock: number }) {
    return this.products.setStock(await this.sellers.platformSellerId(), user.userId, variantId, body.stock);
  }

  @Post('own/products/:productId/photos')
  @UseInterceptors(photo())
  async ownPhoto(@Param('productId', { schema: id }) productId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.products.addPhoto(await this.sellers.platformSellerId(), productId, need(file));
  }

  @Delete('own/products/:productId/photos/:imageId')
  async ownRemovePhoto(@Param('productId', { schema: id }) productId: string, @Param('imageId', { schema: id }) imageId: string) {
    return this.products.removePhoto(await this.sellers.platformSellerId(), productId, imageId);
  }

  @Post('own/products/:productId/photos/:imageId/cover')
  @HttpCode(HttpStatus.OK)
  async ownCover(@Param('productId', { schema: id }) productId: string, @Param('imageId', { schema: id }) imageId: string) {
    return this.products.makeCover(await this.sellers.platformSellerId(), productId, imageId);
  }
}
