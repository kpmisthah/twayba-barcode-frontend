-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('SITE', 'FLOOR', 'ROOM', 'SHELF', 'SPACE', 'TRANSIT', 'DAMAGED');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "type" "LocationType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "locations_parentId_idx" ON "locations"("parentId");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- System locations used by later stock phases: loaded orders and damaged stock.
INSERT INTO "counters" ("name", "value") VALUES ('location', 2)
  ON CONFLICT ("name") DO UPDATE SET "value" = GREATEST("counters"."value", 2);

INSERT INTO "locations" ("id", "type", "name", "code", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'TRANSIT', 'In Transit', 'LOC-000001', 1000, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DAMAGED', 'Damaged', 'LOC-000002', 1001, CURRENT_TIMESTAMP);
