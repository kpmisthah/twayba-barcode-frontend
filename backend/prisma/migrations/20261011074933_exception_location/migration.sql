-- AlterTable
ALTER TABLE "delivery_exceptions" ADD COLUMN     "locationId" UUID;

-- AddForeignKey
ALTER TABLE "delivery_exceptions" ADD CONSTRAINT "delivery_exceptions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
