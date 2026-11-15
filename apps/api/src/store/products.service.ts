import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAX_PRODUCT_PHOTOS, type ProductInput, type SellerProduct } from '@bgym/shared';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { processPhoto } from '../media/image-processor.js';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const productSelect = {
  id: true, title: true, brand: true, description: true, categoryId: true, status: true, reviewNote: true, isFeatured: true, updatedAt: true,
  seller: { select: { type: true } },
  images: { orderBy: { sortOrder: 'asc' }, select: { id: true, key: true, thumbKey: true } },
  variants: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sku: true, pricePesewas: true, compareAtPricePesewas: true, stock: true, reserved: true, weightGrams: true, isActive: true } },
} satisfies Prisma.ProductSelect;

/**
 * A seller's products (BGYM's own, or a partner's). Partners' products are checked by the
 * BGYM team before members see them; BGYM's own go live when published. Options (variants)
 * that have been sold are never deleted, only switched off, so past orders stay intact.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(sellerId: string): Promise<SellerProduct[]> {
    const rows = await this.prisma.product.findMany({ where: { sellerId }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 500, select: productSelect });
    const sold = await this.soldCounts(rows.map((r) => r.id));
    return rows.map((r) => this.toSellerProduct(r, sold.get(r.id) ?? 0));
  }

  async get(sellerId: string, productId: string): Promise<SellerProduct> {
    const row = await this.prisma.product.findFirst({ where: { id: productId, sellerId }, select: productSelect });
    if (!row) throw new NotFoundException('Product not found');
    return this.toSellerProduct(row, (await this.soldCounts([row.id])).get(row.id) ?? 0);
  }

  async create(sellerId: string, actorId: string, input: ProductInput): Promise<SellerProduct> {
    await this.requireCategory(input.categoryId);
    try {
      const product = await this.prisma.product.create({
        data: {
          sellerId,
          categoryId: input.categoryId,
          title: input.title,
          description: input.description || null,
          brand: input.brand || null,
          status: 'draft',
          variants: { create: input.variants.map((v, i) => ({ name: v.name, sku: v.sku, pricePesewas: v.pricePesewas, compareAtPricePesewas: v.compareAtPricePesewas ?? null, stock: v.stock, weightGrams: v.weightGrams ?? null, sortOrder: i })) },
        },
        select: { id: true },
      });
      await this.audit.record({ action: 'product.created', actorId, targetType: 'product', targetId: product.id, metadata: { sellerId } });
      return this.get(sellerId, product.id);
    } catch (err) {
      throw this.skuConflict(err);
    }
  }

  /**
   * Updates details and options. Options left out are switched off (kept for past orders).
   * Changing a live partner product's details sends it back for review.
   */
  async update(sellerId: string, actorId: string, productId: string, input: ProductInput): Promise<SellerProduct> {
    const existing = await this.prisma.product.findFirst({ where: { id: productId, sellerId }, select: { id: true, status: true, title: true, description: true, brand: true, seller: { select: { type: true } }, variants: { select: { id: true } } } });
    if (!existing) throw new NotFoundException('Product not found');
    if (existing.status === 'archived') throw new BadRequestException('Restore the product before editing it.');
    await this.requireCategory(input.categoryId);
    const ids = new Set(existing.variants.map((v) => v.id));
    if (input.variants.some((v) => v.id && !ids.has(v.id))) throw new BadRequestException('One of those options isn’t part of this product.');
    const detailsChanged = existing.title !== input.title || (existing.description ?? '') !== (input.description ?? '') || (existing.brand ?? '') !== (input.brand ?? '');
    const backToReview = existing.seller.type === 'partner' && existing.status === 'active' && detailsChanged;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: { title: input.title, description: input.description || null, brand: input.brand || null, categoryId: input.categoryId, ...(backToReview && { status: 'pending_review', reviewNote: null }) },
        });
        const kept = new Set(input.variants.filter((v) => v.id).map((v) => v.id!));
        await tx.productVariant.updateMany({ where: { productId, id: { notIn: [...kept] } }, data: { isActive: false } });
        for (const [i, v] of input.variants.entries()) {
          const data = { name: v.name, sku: v.sku, pricePesewas: v.pricePesewas, compareAtPricePesewas: v.compareAtPricePesewas ?? null, weightGrams: v.weightGrams ?? null, isActive: true, sortOrder: i };
          if (v.id) {
            // Stock can't go below what's held for unpaid orders.
            const current = await tx.productVariant.findUniqueOrThrow({ where: { id: v.id }, select: { reserved: true } });
            if (v.stock < current.reserved) throw new BadRequestException(`${v.name}: ${current.reserved} are held for orders being paid. Set stock to at least ${current.reserved}.`);
            await tx.productVariant.update({ where: { id: v.id }, data: { ...data, stock: v.stock } });
          } else {
            await tx.productVariant.create({ data: { ...data, productId, stock: v.stock } });
          }
        }
      });
    } catch (err) {
      throw this.skuConflict(err);
    }
    await this.audit.record({ action: 'product.updated', actorId, targetType: 'product', targetId: productId, metadata: { backToReview } });
    return this.get(sellerId, productId);
  }

  /** publish: live (BGYM) or sent for review (partner); unpublish: back to draft; archive: hidden for good. */
  async setStatus(sellerId: string, actorId: string, productId: string, action: 'publish' | 'unpublish' | 'archive'): Promise<SellerProduct> {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
      select: { status: true, seller: { select: { type: true, isActive: true } }, _count: { select: { images: true, variants: { where: { isActive: true } } } } },
    });
    if (!p) throw new NotFoundException('Product not found');
    let status: 'active' | 'pending_review' | 'draft' | 'archived';
    if (action === 'publish') {
      if (p._count.images === 0) throw new BadRequestException('Add at least one photo first.');
      if (p._count.variants === 0) throw new BadRequestException('Add at least one option with a price.');
      if (!p.seller.isActive) throw new BadRequestException('Your store is paused. Contact the BGYM team.');
      status = p.seller.type === 'platform' ? 'active' : 'pending_review';
    } else status = action === 'unpublish' ? 'draft' : 'archived';
    await this.prisma.product.update({ where: { id: productId }, data: { status, ...(status === 'active' && { publishedAt: new Date(), reviewNote: null }), ...(status === 'pending_review' && { reviewNote: null }) } });
    await this.audit.record({ action: `product.${action}`, actorId, targetType: 'product', targetId: productId, metadata: { status } });
    return this.get(sellerId, productId);
  }

  async addPhoto(sellerId: string, productId: string, file: Buffer): Promise<SellerProduct> {
    const p = await this.prisma.product.findFirst({ where: { id: productId, sellerId }, select: { _count: { select: { images: true } } } });
    if (!p) throw new NotFoundException('Product not found');
    if (p._count.images >= MAX_PRODUCT_PHOTOS) throw new BadRequestException(`Up to ${MAX_PRODUCT_PHOTOS} photos per product.`);
    const photo = await processPhoto(file);
    const id = randomUUID();
    const key = `products/${productId}/${id}.webp`;
    const thumbKey = `products/${productId}/${id}_t.webp`;
    await this.storage.put(key, photo.large.data, 'image/webp');
    await this.storage.put(thumbKey, photo.thumb.data, 'image/webp');
    await this.prisma.productImage.create({ data: { id, productId, key, thumbKey, width: photo.large.width, height: photo.large.height, sortOrder: p._count.images } });
    return this.get(sellerId, productId);
  }

  async removePhoto(sellerId: string, productId: string, imageId: string): Promise<SellerProduct> {
    const img = await this.prisma.productImage.findFirst({ where: { id: imageId, productId, product: { sellerId } } });
    if (!img) throw new NotFoundException('Photo not found');
    await this.prisma.productImage.delete({ where: { id: img.id } });
    await this.storage.delete([img.key, img.thumbKey]);
    return this.get(sellerId, productId);
  }

  /** The first photo is the one shown in lists. */
  async makeCover(sellerId: string, productId: string, imageId: string): Promise<SellerProduct> {
    const images = await this.prisma.productImage.findMany({ where: { productId, product: { sellerId } }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
    if (!images.some((i) => i.id === imageId)) throw new NotFoundException('Photo not found');
    const order = [imageId, ...images.map((i) => i.id).filter((id) => id !== imageId)];
    await this.prisma.$transaction(order.map((id, sortOrder) => this.prisma.productImage.update({ where: { id }, data: { sortOrder } })));
    return this.get(sellerId, productId);
  }

  // ── BGYM team ──

  async pendingReview(): Promise<Array<SellerProduct & { seller: string }>> {
    const rows = await this.prisma.product.findMany({ where: { status: 'pending_review' }, orderBy: { updatedAt: 'asc' }, take: 200, select: { ...productSelect, seller: { select: { type: true, name: true } } } });
    return rows.map((r) => ({ ...this.toSellerProduct(r, 0), seller: r.seller.name }));
  }

  async review(actorId: string, productId: string, decision: { decision: 'approve' } | { decision: 'reject'; note: string }): Promise<void> {
    const data = decision.decision === 'approve' ? { status: 'active' as const, publishedAt: new Date(), reviewNote: null } : { status: 'draft' as const, reviewNote: decision.note };
    const { count } = await this.prisma.product.updateMany({ where: { id: productId, status: 'pending_review' }, data });
    if (!count) throw new NotFoundException('That product isn’t waiting for review.');
    await this.audit.record({ action: `product.${decision.decision === 'approve' ? 'approved' : 'rejected'}`, actorId, targetType: 'product', targetId: productId });
  }

  async setFeatured(actorId: string, productId: string, isFeatured: boolean): Promise<void> {
    const { count } = await this.prisma.product.updateMany({ where: { id: productId }, data: { isFeatured } });
    if (!count) throw new NotFoundException('Product not found');
    await this.audit.record({ action: 'product.featured', actorId, targetType: 'product', targetId: productId, metadata: { isFeatured } });
  }

  // ── helpers ──

  private async requireCategory(id: string): Promise<void> {
    if (!(await this.prisma.category.count({ where: { id } }))) throw new BadRequestException('Choose a category from the list.');
  }

  private skuConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return new ConflictException('That SKU is already used by another product. SKUs must be unique.');
    return err;
  }

  private async soldCounts(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ productId: string; sold: bigint }>>`
      SELECT v."productId", COALESCE(SUM(oi.quantity), 0) AS sold
      FROM order_items oi JOIN product_variants v ON v.id = oi."variantId" JOIN orders o ON o.id = oi."orderId"
      WHERE v."productId" = ANY(${productIds}::uuid[]) AND o.status NOT IN ('pending_payment', 'cancelled', 'refunded')
      GROUP BY v."productId"`;
    return new Map(rows.map((r) => [r.productId, Number(r.sold)]));
  }

  private toSellerProduct(r: Prisma.ProductGetPayload<{ select: typeof productSelect }>, sold: number): SellerProduct {
    return {
      id: r.id,
      title: r.title,
      brand: r.brand,
      description: r.description,
      categoryId: r.categoryId,
      status: r.status,
      reviewNote: r.reviewNote,
      isFeatured: r.isFeatured,
      images: r.images.map((i) => ({ id: i.id, url: this.storage.publicUrl(i.key), thumbUrl: this.storage.publicUrl(i.thumbKey) })),
      variants: r.variants,
      sold,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
