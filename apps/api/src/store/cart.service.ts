import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_CART_LINES, type Cart } from '@bgym/shared';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buyableProduct } from './catalogue.service.js';

/** The member's cart, kept on the server (the same on every device). Prices are always today's. */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(userId: string): Promise<Cart> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { updatedAt: 'asc' },
      select: {
        quantity: true,
        variant: {
          select: {
            id: true, name: true, pricePesewas: true, stock: true, reserved: true, isActive: true,
            product: { select: { id: true, title: true, status: true, seller: { select: { id: true, name: true, isActive: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { thumbKey: true } } } },
          },
        },
      },
    });
    const lines = rows.map(({ quantity, variant: v }) => {
      const sellable = v.isActive && v.product.status === 'active' && v.product.seller.isActive;
      return {
        variantId: v.id,
        productId: v.product.id,
        title: v.product.title,
        variantName: v.name,
        thumbUrl: v.product.images[0] ? this.storage.publicUrl(v.product.images[0].thumbKey) : null,
        unitPricePesewas: v.pricePesewas,
        quantity,
        available: sellable ? Math.max(0, v.stock - v.reserved) : 0,
        seller: { id: v.product.seller.id, name: v.product.seller.name },
      };
    });
    return { lines, subtotalPesewas: lines.reduce((s, l) => s + l.unitPricePesewas * l.quantity, 0), count: lines.reduce((s, l) => s + l.quantity, 0) };
  }

  /** Sets a line's quantity (0 removes it). */
  async set(userId: string, variantId: string, quantity: number): Promise<Cart> {
    if (quantity === 0) {
      await this.prisma.cartItem.deleteMany({ where: { userId, variantId } });
      return this.get(userId);
    }
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, isActive: true, product: buyableProduct() }, select: { stock: true, reserved: true } });
    if (!variant) throw new NotFoundException('That product isn’t available any more.');
    if (variant.stock - variant.reserved < quantity) throw new BadRequestException(variant.stock - variant.reserved > 0 ? `Only ${variant.stock - variant.reserved} left.` : 'Sold out.');
    const exists = await this.prisma.cartItem.count({ where: { userId, variantId } });
    if (!exists && (await this.prisma.cartItem.count({ where: { userId } })) >= MAX_CART_LINES) throw new BadRequestException('Your cart is full. Check out or remove something first.');
    await this.prisma.cartItem.upsert({ where: { userId_variantId: { userId, variantId } }, create: { userId, variantId, quantity }, update: { quantity } });
    return this.get(userId);
  }
}
