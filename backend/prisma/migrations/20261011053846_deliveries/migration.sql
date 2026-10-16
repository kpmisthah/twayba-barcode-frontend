-- CreateEnum
CREATE TYPE "DeliveryExceptionType" AS ENUM ('MISSING_BOX', 'DAMAGED_BOX', 'CUSTOMER_REFUSED', 'NOT_HOME', 'WRONG_ADDRESS', 'OTHER');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';

-- AlterTable
ALTER TABLE "order_allocations" ADD COLUMN     "delivered" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "codCollected" DECIMAL(12,2),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveredById" UUID,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "deliveryPhotoUrl" TEXT,
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "partialApprovedById" UUID,
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "delivery_exceptions" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "DeliveryExceptionType" NOT NULL,
    "variantId" UUID,
    "note" TEXT NOT NULL,
    "photoUrl" TEXT,
    "reportedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_exceptions_orderId_idx" ON "delivery_exceptions"("orderId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_partialApprovedById_fkey" FOREIGN KEY ("partialApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_exceptions" ADD CONSTRAINT "delivery_exceptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_exceptions" ADD CONSTRAINT "delivery_exceptions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_exceptions" ADD CONSTRAINT "delivery_exceptions_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_allocations" DROP CONSTRAINT "order_allocations_counts_check";
ALTER TABLE "order_allocations" ADD CONSTRAINT "order_allocations_counts_check"
  CHECK ("quantity" > 0 AND "picked" >= 0 AND "released" >= 0 AND "picked" + "released" <= "quantity"
         AND "delivered" >= 0 AND "returned" >= 0 AND "delivered" + "returned" <= "picked");

-- Delivery problem reports are a log: never edited or deleted.
CREATE TRIGGER delivery_exceptions_append_only BEFORE UPDATE OR DELETE ON "delivery_exceptions"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();