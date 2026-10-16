-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "siteId" UUID,
    "cashierId" UUID NOT NULL,
    "approvedById" UUID,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "note" TEXT,
    "currency" TEXT NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL,
    "grossTotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "netTotal" DECIMAL(12,2) NOT NULL,
    "taxTotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paidTotal" DECIMAL(12,2) NOT NULL,
    "changeGiven" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "variantId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "taxRateName" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_picks" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoiceNumber_key" ON "sales"("invoiceNumber");

-- CreateIndex
CREATE INDEX "sales_createdAt_idx" ON "sales"("createdAt");

-- CreateIndex
CREATE INDEX "sales_cashierId_idx" ON "sales"("cashierId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_lines_saleId_lineNo_key" ON "sale_lines"("saleId", "lineNo");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_picks" ADD CONSTRAINT "sale_picks_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "sale_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_picks" ADD CONSTRAINT "sale_picks_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_picks" ADD CONSTRAINT "sale_picks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoices are immutable: a completed sale, its lines, picks and payments can't be edited or
-- deleted, even by hand. Returns will create credit notes instead.
CREATE FUNCTION reject_invoice_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is immutable (% not allowed)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sales_immutable BEFORE UPDATE OR DELETE ON "sales"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();
CREATE TRIGGER sale_lines_immutable BEFORE UPDATE OR DELETE ON "sale_lines"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();
CREATE TRIGGER sale_picks_immutable BEFORE UPDATE OR DELETE ON "sale_picks"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION reject_invoice_change();
CREATE TRIGGER sales_no_truncate BEFORE TRUNCATE ON "sales"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_invoice_change();

ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "sale_picks" ADD CONSTRAINT "sale_picks_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);
