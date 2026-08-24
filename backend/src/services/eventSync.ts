/**
 * Keeps SQLite in sync with on-chain events.
 *
 * The chain is the source of truth; these tables are a read cache so list and history views
 * don't cost one RPC round trip per row. Two things follow from that. Every handler is
 * idempotent and keyed on something the chain assigns (projectId, submissionId, tokenId,
 * txHash+logIndex), so replaying a block range can only overwrite a row with the same facts.
 * And the write-through updates elsewhere in the backend are only a latency optimisation —
 * whatever they wrote, this service will reconcile against the log.
 *
 * Sync is a backfill pass from the last synced block, then a live subscription. The backfill is
 * what makes a restart safe: anything that happened while the process was down is picked up
 * from the log rather than silently missed.
 */

import { ethers } from "ethers";
import { prisma } from "../db";
import { provider } from "../blockchain/provider";
import { projectRegistry, verificationRegistry, carbonCreditToken, marketplace } from "../blockchain/contracts";
import { config } from "../config";
import { ecosystemFromInt, projectStatusFromInt } from "../utils/ecosystem";
import { fromMicrodegree } from "../utils/geo";

// Public RPCs commonly cap eth_getLogs ranges; 2000 stays well inside typical limits.
const MAX_BLOCK_RANGE = 2000;

async function blockTimestamp(blockNumber: number): Promise<Date> {
  const block = await provider.getBlock(blockNumber);
  return new Date((block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
}

async function handleProjectRegistered(log: ethers.Log) {
  const parsed = projectRegistry.interface.parseLog(log);
  if (!parsed) return;

  const projectId = Number(parsed.args.projectId);
  // The event carries only the vertex count, so read the polygon itself from contract state.
  const boundaryPoints = await projectRegistry.getProjectBoundary(projectId);
  const boundary = boundaryPoints.map((point: { latitudeE6: bigint; longitudeE6: bigint }) => fromMicrodegree(point));

  await prisma.onChainProject.upsert({
    where: { projectId },
    create: {
      projectId,
      name: parsed.args.name,
      ecosystem: ecosystemFromInt(parsed.args.ecosystem),
      implementerAddress: parsed.args.implementer,
      status: "Active",
      registeredAt: new Date(Number(parsed.args.registeredAt) * 1000),
      boundary: JSON.stringify(boundary),
      registrationTxHash: log.transactionHash,
    },
    update: {
      name: parsed.args.name,
      ecosystem: ecosystemFromInt(parsed.args.ecosystem),
      implementerAddress: parsed.args.implementer,
      boundary: JSON.stringify(boundary),
      registrationTxHash: log.transactionHash,
    },
  });
}

async function handleProjectStatusChanged(log: ethers.Log) {
  const parsed = projectRegistry.interface.parseLog(log);
  if (!parsed) return;

  const projectId = Number(parsed.args.projectId);
  await prisma.onChainProject.updateMany({
    where: { projectId },
    data: { status: projectStatusFromInt(parsed.args.newStatus) },
  });
}

async function handleVerificationSubmitted(log: ethers.Log) {
  const parsed = verificationRegistry.interface.parseLog(log);
  if (!parsed) return;

  const submissionId = Number(parsed.args.submissionId);
  const existing = await prisma.mrvReport.findUnique({ where: { submissionId } });
  // The full report body only exists off chain, so a submission this backend never saw can't be
  // reconstructed from the log alone. Record what the chain knows and flag the gap.
  if (!existing) {
    await prisma.mrvReport.create({
      data: {
        submissionId,
        projectId: Number(parsed.args.projectId),
        vintage: Number(parsed.args.vintage),
        tonnesCO2: Number(parsed.args.claimedTonnes),
        methodology: "unknown (submitted outside this backend)",
        supportingDataRef: "unknown (submitted outside this backend)",
        reportPayload: JSON.stringify({ note: "Report body not available: submission did not originate from this backend." }),
        dataHash: parsed.args.dataHash,
        submittedByAddress: parsed.args.submitter,
        submittedAt: new Date(Number(parsed.args.submittedAt) * 1000),
        submitTxHash: log.transactionHash,
        status: "Pending",
      },
    });
  }
}

async function handleVerificationApproved(log: ethers.Log) {
  const parsed = verificationRegistry.interface.parseLog(log);
  if (!parsed) return;

  const submissionId = Number(parsed.args.submissionId);
  await prisma.mrvReport.updateMany({
    where: { submissionId, status: "Pending" },
    data: {
      status: "Approved",
      verifierAddress: parsed.args.verifier,
      verifiedAt: new Date(Number(parsed.args.approvedAt) * 1000),
      verifyTxHash: log.transactionHash,
    },
  });
}

async function handleVerificationRejected(log: ethers.Log) {
  const parsed = verificationRegistry.interface.parseLog(log);
  if (!parsed) return;

  const submissionId = Number(parsed.args.submissionId);
  await prisma.mrvReport.updateMany({
    where: { submissionId },
    data: {
      status: "Rejected",
      verifierAddress: parsed.args.verifier,
      verifiedAt: new Date(Number(parsed.args.rejectedAt) * 1000),
      verifyTxHash: log.transactionHash,
      rejectionReason: parsed.args.reason,
    },
  });
}

async function handleCreditsMinted(log: ethers.Log) {
  const parsed = carbonCreditToken.interface.parseLog(log);
  if (!parsed) return;

  const tokenId = (parsed.args.tokenId as bigint).toString();
  const projectId = Number(parsed.args.projectId);
  const vintage = Number(parsed.args.vintage);
  // totalMinted is an accumulator on chain; read it rather than summing events ourselves.
  const totalMinted = (await carbonCreditToken.totalMinted(parsed.args.tokenId)) as bigint;
  const totalRetired = (await carbonCreditToken.totalRetired(parsed.args.tokenId)) as bigint;

  await prisma.creditBatch.upsert({
    where: { tokenId },
    create: {
      tokenId,
      projectId,
      vintage,
      verifierAddress: parsed.args.verifier,
      dataHash: parsed.args.dataHash,
      totalMinted: totalMinted.toString(),
      totalRetired: totalRetired.toString(),
      issuedAt: await blockTimestamp(log.blockNumber),
      mintTxHash: log.transactionHash,
    },
    update: {
      verifierAddress: parsed.args.verifier,
      dataHash: parsed.args.dataHash,
      totalMinted: totalMinted.toString(),
      totalRetired: totalRetired.toString(),
      mintTxHash: log.transactionHash,
    },
  });

  await prisma.mrvReport.updateMany({
    where: { projectId, vintage },
    data: { status: "Issued", tokenId, mintTxHash: log.transactionHash },
  });
}

async function handleRetirementRecord(log: ethers.Log) {
  const parsed = carbonCreditToken.interface.parseLog(log);
  if (!parsed) return;

  const tokenId = (parsed.args.tokenId as bigint).toString();
  await prisma.retirementRecord.upsert({
    where: { onChainRetirementId: Number(parsed.args.retirementId) },
    create: {
      onChainRetirementId: Number(parsed.args.retirementId),
      tokenId,
      amount: (parsed.args.amount as bigint).toString(),
      retiredByAddress: parsed.args.retiredBy,
      reason: parsed.args.reason,
      retiredAt: new Date(Number(parsed.args.retiredAt) * 1000),
      txHash: log.transactionHash,
    },
    update: {},
  });

  const totalRetired = (await carbonCreditToken.totalRetired(parsed.args.tokenId)) as bigint;
  await prisma.creditBatch.updateMany({ where: { tokenId }, data: { totalRetired: totalRetired.toString() } });
}

async function handleTransferSingle(log: ethers.Log) {
  const parsed = carbonCreditToken.interface.parseLog(log);
  if (!parsed) return;

  await prisma.transferEvent.upsert({
    // txHash + logIndex is the chain's own unique identity for a log, so a replayed range
    // updates the same row instead of duplicating it.
    where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.index } },
    create: {
      tokenId: (parsed.args.id as bigint).toString(),
      operatorAddress: parsed.args.operator,
      fromAddress: parsed.args.from,
      toAddress: parsed.args.to,
      amount: (parsed.args.value as bigint).toString(),
      txHash: log.transactionHash,
      logIndex: log.index,
      blockNumber: log.blockNumber,
      occurredAt: await blockTimestamp(log.blockNumber),
    },
    update: {},
  });
}

/**
 * A listing can be created directly on chain without going through routes/marketplace.ts's
 * write-through (that route only covers this backend's own implementer-wallet pool listing —
 * seed-demo-data.ts, for instance, lists straight from a contracts script). CreditsListed is
 * this cache's real source of truth for a listing's existence, the same way ProjectRegistered
 * is for OnChainProject; the route's write-through is only a latency optimisation on top.
 */
async function handleCreditsListed(log: ethers.Log) {
  const parsed = marketplace.interface.parseLog(log);
  if (!parsed) return;

  const listingId = Number(parsed.args.listingId);
  const tokenId = (parsed.args.tokenId as bigint).toString();
  const [projectId, vintage]: [bigint, bigint] = await carbonCreditToken.decodeTokenId(parsed.args.tokenId);

  await prisma.marketplaceListing.upsert({
    where: { listingId },
    create: {
      listingId,
      tokenId,
      projectId: Number(projectId),
      vintage: Number(vintage),
      sellerAddress: parsed.args.seller,
      amount: Number(parsed.args.amount),
      pricePerTonne: (parsed.args.pricePerTonne as bigint).toString(),
      active: true,
      listTxHash: log.transactionHash,
    },
    update: {
      amount: Number(parsed.args.amount),
      pricePerTonne: (parsed.args.pricePerTonne as bigint).toString(),
      active: true,
      listTxHash: log.transactionHash,
    },
  });
}

async function handleListingCancelled(log: ethers.Log) {
  const parsed = marketplace.interface.parseLog(log);
  if (!parsed) return;

  await prisma.marketplaceListing.updateMany({
    where: { listingId: Number(parsed.args.listingId) },
    data: { active: false, amount: 0 },
  });
}

/**
 * A purchase can happen without going through routes/marketplace.ts's write-through the same
 * way a listing can — a buyer connecting their own wallet directly to Marketplace, bypassing
 * this backend's buyer-wallet pool entirely, is exactly what a real (non-demo) purchase would
 * look like. This is the authoritative path for MarketplacePurchase, upserted by (txHash,
 * logIndex) so a replayed range can only overwrite a row with the same facts, never duplicate
 * it. It also re-reads the listing's remaining amount from chain rather than trusting event math
 * to derive it — same reasoning as handleCreditsMinted reading totalMinted back from
 * CarbonCreditToken instead of accumulating mint amounts itself.
 */
async function handleCreditsPurchased(log: ethers.Log) {
  const parsed = marketplace.interface.parseLog(log);
  if (!parsed) return;

  const listingId = Number(parsed.args.listingId);
  const [projectId, vintage]: [bigint, bigint] = await carbonCreditToken.decodeTokenId(parsed.args.tokenId);

  await prisma.marketplacePurchase.upsert({
    where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.index } },
    create: {
      listingId,
      tokenId: (parsed.args.tokenId as bigint).toString(),
      projectId: Number(projectId),
      vintage: Number(vintage),
      buyerAddress: parsed.args.buyer,
      sellerAddress: parsed.args.seller,
      amount: Number(parsed.args.amount),
      totalPrice: (parsed.args.totalPrice as bigint).toString(),
      ngoAmount: (parsed.args.ngoAmount as bigint).toString(),
      platformAmount: (parsed.args.platformAmount as bigint).toString(),
      communityAmount: (parsed.args.communityAmount as bigint).toString(),
      txHash: log.transactionHash,
      logIndex: log.index,
      purchasedAt: await blockTimestamp(log.blockNumber),
    },
    update: {},
  });

  const listing = await marketplace.getListing(listingId);
  await prisma.marketplaceListing.updateMany({
    where: { listingId },
    data: { amount: Number(listing.amount), active: listing.active },
  });
}

type LogHandler = (log: ethers.Log) => Promise<void>;

interface WatchedEvent {
  contract: ethers.Contract;
  eventName: string;
  handler: LogHandler;
}

function watchedEvents(): WatchedEvent[] {
  return [
    { contract: projectRegistry, eventName: "ProjectRegistered", handler: handleProjectRegistered },
    { contract: projectRegistry, eventName: "ProjectStatusChanged", handler: handleProjectStatusChanged },
    { contract: verificationRegistry, eventName: "VerificationSubmitted", handler: handleVerificationSubmitted },
    { contract: verificationRegistry, eventName: "VerificationApproved", handler: handleVerificationApproved },
    { contract: verificationRegistry, eventName: "VerificationRejected", handler: handleVerificationRejected },
    { contract: carbonCreditToken, eventName: "CreditsMinted", handler: handleCreditsMinted },
    { contract: carbonCreditToken, eventName: "RetirementRecord", handler: handleRetirementRecord },
    { contract: carbonCreditToken, eventName: "TransferSingle", handler: handleTransferSingle },
    { contract: marketplace, eventName: "CreditsListed", handler: handleCreditsListed },
    { contract: marketplace, eventName: "ListingCancelled", handler: handleListingCancelled },
    { contract: marketplace, eventName: "CreditsPurchased", handler: handleCreditsPurchased },
  ];
}

/** Replays every watched event between two blocks, in chain order, into SQLite. */
async function backfillRange(fromBlock: number, toBlock: number): Promise<number> {
  const events = watchedEvents();
  const collected: { log: ethers.Log; handler: LogHandler }[] = [];

  for (const { contract, eventName, handler } of events) {
    const logs = await contract.queryFilter(contract.filters[eventName](), fromBlock, toBlock);
    for (const log of logs) {
      collected.push({ log: log as ethers.Log, handler });
    }
  }

  // Apply in chain order so dependent rows land in the order the chain produced them —
  // CreditsMinted before the RetirementRecord that reduces the same batch, for instance.
  collected.sort((a, b) =>
    a.log.blockNumber === b.log.blockNumber ? a.log.index - b.log.index : a.log.blockNumber - b.log.blockNumber
  );

  for (const { log, handler } of collected) {
    await handler(log);
  }

  return collected.length;
}

/**
 * Backfills from the last synced block to chain head, then subscribes for live events.
 * Returns once the backfill is done; the subscription keeps running in the background.
 */
export async function startEventSync(): Promise<void> {
  const state = await prisma.syncState.findUnique({ where: { network: config.network } });
  const head = await provider.getBlockNumber();
  let cursor = state ? state.lastSyncedBlock + 1 : 0;

  if (cursor <= head) {
    console.log(`[event-sync] backfilling blocks ${cursor}..${head} on ${config.network}`);
    let total = 0;
    while (cursor <= head) {
      const rangeEnd = Math.min(cursor + MAX_BLOCK_RANGE - 1, head);
      total += await backfillRange(cursor, rangeEnd);
      cursor = rangeEnd + 1;
    }
    console.log(`[event-sync] backfill applied ${total} events`);
  }

  await prisma.syncState.upsert({
    where: { network: config.network },
    create: { network: config.network, lastSyncedBlock: head },
    update: { lastSyncedBlock: head },
  });

  // Live sync is driven off new-block notifications rather than one `contract.on(filter, ...)`
  // subscription per watched event (eleven separate eth_newFilter/eth_getFilterChanges polls
  // against Hardhat, one per event type). That approach turned out to be genuinely fragile in
  // practice: under a burst of rapid transactions (many blocks minted close together, exactly
  // what a live demo produces), ethers' filter-polling subscriber started throwing "results is
  // not iterable" on every poll and never recovered — meaning the live listener silently stopped
  // picking up new events for the rest of the process's life, with nothing in the logs loud
  // enough to notice mid-demo. Block-number polling uses a different, simpler ethers code path
  // (no per-topic filter to go stale) and reuses backfillRange — the exact same, already-tested
  // function the startup backfill above uses — for each new block, so there's one code path for
  // "catch up on some range of blocks" instead of two.
  //
  // Processed strictly one block at a time via a rolling promise chain: Hardhat's auto-mine can
  // fire "block" notifications faster than backfillRange finishes, and processing them out of
  // order (or concurrently) could interleave writes to syncState.lastSyncedBlock incorrectly.
  let chain: Promise<void> = Promise.resolve();
  provider.on("block", (blockNumber: number) => {
    chain = chain
      .then(async () => {
        await backfillRange(blockNumber, blockNumber);
        await prisma.syncState.upsert({
          where: { network: config.network },
          create: { network: config.network, lastSyncedBlock: blockNumber },
          update: { lastSyncedBlock: blockNumber },
        });
      })
      .catch((error) => {
        // A failed block must not kill the listener; the next backfill on startup will retry it.
        console.error(`[event-sync] failed processing block ${blockNumber}:`, error);
      });
  });

  console.log(`[event-sync] listening for live events on ${config.network}`);
}
