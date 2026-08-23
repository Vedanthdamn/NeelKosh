-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "listingId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "vintage" INTEGER NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "pricePerTonne" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "listTxHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MarketplacePurchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listingId" INTEGER NOT NULL,
    "tokenId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "vintage" INTEGER NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "totalPrice" TEXT NOT NULL,
    "ngoAmount" TEXT NOT NULL,
    "platformAmount" TEXT NOT NULL,
    "communityAmount" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "purchasedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MarketplaceListing_projectId_idx" ON "MarketplaceListing"("projectId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerAddress_idx" ON "MarketplaceListing"("sellerAddress");

-- CreateIndex
CREATE INDEX "MarketplaceListing_active_idx" ON "MarketplaceListing"("active");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_buyerAddress_idx" ON "MarketplacePurchase"("buyerAddress");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_listingId_idx" ON "MarketplacePurchase"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePurchase_txHash_logIndex_key" ON "MarketplacePurchase"("txHash", "logIndex");
