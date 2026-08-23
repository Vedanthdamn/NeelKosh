-- AlterTable
ALTER TABLE "MrvReport" ADD COLUMN "photoHash" TEXT;
ALTER TABLE "MrvReport" ADD COLUMN "photoVerification" TEXT;

-- CreateIndex
CREATE INDEX "MrvReport_photoHash_idx" ON "MrvReport"("photoHash");
