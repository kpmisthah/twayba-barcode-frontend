-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'ADJUSTMENT', 'RESERVE', 'RELEASE', 'LOAD', 'DELIVER', 'RETURN', 'SALE', 'SALE_RETURN', 'DAMAGE');

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "userId" UUID,
    "reason" TEXT,
    "note" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_levels_locationId_idx" ON "stock_levels"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_variantId_locationId_key" ON "stock_levels"("variantId", "locationId");

-- CreateIndex
CREATE INDEX "stock_movements_variantId_createdAt_idx" ON "stock_movements"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_fromLocationId_idx" ON "stock_movements"("fromLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_toLocationId_idx" ON "stock_movements"("toLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Last line of defence behind StockService: stock can never go negative or be over-reserved.
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_onHand_check" CHECK ("onHand" >= 0);
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_reserved_check" CHECK ("reserved" >= 0 AND "reserved" <= "onHand");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_check" CHECK ("quantity" > 0);

-- The movement ledger is append-only: history can't be edited or deleted, even by hand.
CREATE FUNCTION stock_movements_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_no_update_delete
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_append_only();

CREATE TRIGGER stock_movements_no_truncate
  BEFORE TRUNCATE ON "stock_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION stock_movements_append_only();
