-- CreateTable
CREATE TABLE "ProjectMetadata" (
    "projectId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT,
    "story" TEXT,
    "photos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OnChainProject" (
    "projectId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "implementerAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "registeredAt" DATETIME NOT NULL,
    "boundary" TEXT NOT NULL,
    "registrationTxHash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MrvReport" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "submissionId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "vintage" INTEGER NOT NULL,
    "tonnesCO2" INTEGER NOT NULL,
    "methodology" TEXT NOT NULL,
    "supportingDataRef" TEXT NOT NULL,
    "reportPayload" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "submittedByAddress" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitTxHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "verifierAddress" TEXT,
    "verifiedAt" DATETIME,
    "verifyTxHash" TEXT,
    "tokenId" TEXT,
    "mintTxHash" TEXT
);

-- CreateTable
CREATE TABLE "CreditBatch" (
    "tokenId" TEXT NOT NULL PRIMARY KEY,
    "projectId" INTEGER NOT NULL,
    "vintage" INTEGER NOT NULL,
    "verifierAddress" TEXT NOT NULL,
    "dataHash" TEXT NOT NULL,
    "totalMinted" TEXT NOT NULL,
    "totalRetired" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "mintTxHash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RetirementRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "onChainRetirementId" INTEGER NOT NULL,
    "tokenId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "retiredByAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "retiredAt" DATETIME NOT NULL,
    "txHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TransferEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenId" TEXT NOT NULL,
    "operatorAddress" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "occurredAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncState" (
    "network" TEXT NOT NULL PRIMARY KEY,
    "lastSyncedBlock" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OnChainProject_implementerAddress_idx" ON "OnChainProject"("implementerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MrvReport_submissionId_key" ON "MrvReport"("submissionId");

-- CreateIndex
CREATE INDEX "MrvReport_projectId_idx" ON "MrvReport"("projectId");

-- CreateIndex
CREATE INDEX "CreditBatch_projectId_idx" ON "CreditBatch"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RetirementRecord_onChainRetirementId_key" ON "RetirementRecord"("onChainRetirementId");

-- CreateIndex
CREATE INDEX "RetirementRecord_tokenId_idx" ON "RetirementRecord"("tokenId");

-- CreateIndex
CREATE INDEX "TransferEvent_tokenId_idx" ON "TransferEvent"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferEvent_txHash_logIndex_key" ON "TransferEvent"("txHash", "logIndex");
