-- CreateEnum
CREATE TYPE "ImportIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "import_issues" (
    "id" UUID NOT NULL,
    "source" "OrderSource" NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "status" "ImportIssueStatus" NOT NULL DEFAULT 'OPEN',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTriedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" UUID,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_issues_status_idx" ON "import_issues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "import_issues_source_externalId_key" ON "import_issues"("source", "externalId");
