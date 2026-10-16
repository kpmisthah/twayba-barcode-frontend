-- AlterTable
ALTER TABLE "users" ADD COLUMN     "siteIds" UUID[] DEFAULT ARRAY[]::UUID[];
