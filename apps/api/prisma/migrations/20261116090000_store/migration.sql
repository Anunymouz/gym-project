-- DropIndex
DROP INDEX "orders_paymentId_key";

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "distanceMeters" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "commissionPesewas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contactPhone" TEXT NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paidAt" TIMESTAMPTZ(3),
ADD COLUMN     "pickupLocationId" UUID,
ADD COLUMN     "refundDue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "sellerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "product_images" DROP COLUMN "url",
ADD COLUMN     "height" INTEGER NOT NULL,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "thumbKey" TEXT NOT NULL,
ADD COLUMN     "width" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "publishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewNote" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "processedAt" TIMESTAMPTZ(3),
ADD COLUMN     "providerRefundId" TEXT;

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "payoutAccountLast4" TEXT,
ADD COLUMN     "payoutAccountName" TEXT,
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "payoutUpdatedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_sellerId_status_createdAt_idx" ON "orders"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_paymentId_idx" ON "orders"("paymentId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "pickup_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Store integrity: quantities and money can't go negative; stock can't be over-reserved.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_valid" CHECK ("quantity" > 0 AND "unitPricePesewas" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_money_valid" CHECK ("subtotalPesewas" > 0 AND "deliveryFeePesewas" >= 0 AND "commissionPesewas" >= 0 AND "commissionPesewas" <= "subtotalPesewas");
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_valid" CHECK ("quantity" > 0 AND "quantity" <= 50);
-- One seller is BGYM itself.
CREATE UNIQUE INDEX "sellers_one_platform" ON "sellers" ("type") WHERE "type" = 'platform';
CREATE INDEX "products_search" ON "products" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("brand", '')));
