import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProductCard, ProductDetail, StoreCategory, StorePage, StoreQuery } from '@bgym/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { decodeCursor, encodeCursor } from '../feed/cursor.js';
import { StorageService } from '../media/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE = 24;

/** What members can buy: live products from active sellers, with at least one option on sale. */
export const buyableProduct = (): Prisma.ProductWhereInput => ({
  status: 'active',
  seller: { isActive: true },
  variants: { some: { isActive: true } },
});

const cardSelect = {
  id: true, title: true, brand: true, createdAt: true,
  seller: { select: { name: true } },
  category: { select: { slug: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true, thumbKey: true } },
  variants: { where: { isActive: true }, orderBy: { pricePesewas: 'asc' }, select: { id: true, name: true, pricePesewas: true, compareAtPricePesewas: true, stock: true, reserved: true } },
} satisfies Prisma.ProductSelect;

/** The BGYM Store as members see it. Anyone signed in can browse; no gym needed. */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  categories(): Promise<StoreCategory[]> {
    return this.prisma.category.findMany({ where: { parentId: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } });
  }

  /** Newest first (stable paging); search matches title and brand. */
  async list(query: StoreQuery): Promise<StorePage> {
    const after = decodeCursor(query.cursor);
    const q = query.q?.trim();
    const rows = await this.prisma.product.findMany({
      where: {
        ...buyableProduct(),
        ...(query.category && { category: { slug: query.category } }),
        AND: [
          ...(q ? [{ OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { brand: { contains: q, mode: 'insensitive' as const } }] }] : []),
          ...(after ? [{ OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      select: cardSelect,
    });
    const page = rows.slice(0, PAGE);
    return { products: page.map((r) => this.toCard(r)), nextCursor: rows.length > PAGE ? encodeCursor(page.at(-1)!) : null };
  }

  async product(productId: string): Promise<ProductDetail> {
    const r = await this.prisma.product.findFirst({
      where: { id: productId, ...buyableProduct() },
      select: { ...cardSelect, description: true, images: { orderBy: { sortOrder: 'asc' }, select: { key: true, thumbKey: true, width: true, height: true } } },
    });
    if (!r) throw new NotFoundException('This product isn’t available.');
    return {
      ...this.toCard({ ...r, images: r.images.slice(0, 1) }),
      description: r.description,
      images: r.images.map((i) => ({ url: this.storage.publicUrl(i.key), thumbUrl: this.storage.publicUrl(i.thumbKey), width: i.width, height: i.height })),
      variants: r.variants.map((v) => ({ id: v.id, name: v.name, pricePesewas: v.pricePesewas, compareAtPricePesewas: v.compareAtPricePesewas, available: Math.max(0, Math.min(99, v.stock - v.reserved)) })),
    };
  }

  private toCard(r: Prisma.ProductGetPayload<{ select: typeof cardSelect }>): ProductCard {
    const cheapest = r.variants.find((v) => v.stock - v.reserved > 0) ?? r.variants[0]!;
    const img = r.images[0];
    return {
      id: r.id,
      title: r.title,
      brand: r.brand,
      imageUrl: img ? this.storage.publicUrl(img.key) : null,
      thumbUrl: img ? this.storage.publicUrl(img.thumbKey) : null,
      pricePesewas: cheapest.pricePesewas,
      compareAtPricePesewas: cheapest.compareAtPricePesewas,
      inStock: r.variants.some((v) => v.stock - v.reserved > 0),
      seller: r.seller.name,
      category: r.category.slug,
    };
  }
}
