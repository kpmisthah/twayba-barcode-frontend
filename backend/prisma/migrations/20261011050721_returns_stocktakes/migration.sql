-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('COUNTING', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "creditNumber" TEXT NOT NULL,
    "saleId" UUID NOT NULL,
    "cashierId" UUID NOT NULL,
    "reason" TEXT,
    "refundMethod" "PaymentMethod" NOT NULL,
    "refundReference" TEXT,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "taxTotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" UUID NOT NULL,
    "creditNoteId" UUID NOT NULL,
    "saleLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "locationId" UUID NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "locationId" UUID NOT NULL,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'COUNTING',
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "submittedById" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_lines" (
    "id" UUID NOT NULL,
    "stocktakeId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER,
    "onHandAtApproval" INTEGER,
    "adjustment" INTEGER,
    "countedById" UUID,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "stocktake_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNumber_key" ON "credit_notes"("creditNumber");

-- CreateIndex
CREATE INDEX "credit_notes_saleId_idx" ON "credit_notes"("saleId");

-- CreateIndex
CREATE INDEX "credit_notes_createdAt_idx" ON "credit_notes"("createdAt");

-- CreateIndex
CREATE INDEX "credit_note_lines_saleLineId_idx" ON "credit_note_lines"("saleLineId");

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_number_key" ON "stocktakes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_code_key" ON "stocktakes"("code");

-- CreateIndex
CREATE INDEX "stocktakes_status_idx" ON "stocktakes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stocktake_lines_stocktakeId_variantId_locationId_key" ON "stocktake_lines"("stocktakeId", "variantId", "locationId");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "sale_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "stocktakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Credit notes are immutable, like invoices.
CREATE TRIGGER credit_notes_immutable BEFORE UPDATE OR DELETE ON "credit_notes"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();
CREATE TRIGGER credit_note_lines_immutable BEFORE UPDATE OR DELETE ON "credit_note_lines"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();

ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_counts_check" CHECK ("expected" >= 0 AND ("counted" IS NULL OR "counted" >= 0));