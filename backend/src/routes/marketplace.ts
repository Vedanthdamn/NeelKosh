import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { prisma } from "../db";
import { carbonCreditToken, marketplace, simStablecoin } from "../blockchain/contracts";
import { findImplementerWallet, findBuyerWallet, nonceManagerFor, sendWithNonceRetry } from "../blockchain/wallets";
import { config } from "../config";
import { validateBody } from "../middleware/validate";
import { requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { logStage } from "../utils/logger";
import { parseJsonField } from "../utils/serialize";
import type { LatLng } from "../utils/geo";

export const marketplaceRouter = Router();

interface ListingDetail {
  listingId: number;
  tokenId: string;
  projectId: number;
  vintage: number;
  sellerAddress: string;
  amount: number;
  pricePerTonne: string;
  active: boolean;
  listTxHash: string;
  createdAt: Date;
  project: { projectId: number; name: string; ecosystem: string; boundary: LatLng[] } | null;
}

function serializeListing(
  listing: {
    listingId: number;
    tokenId: string;
    projectId: number;
    vintage: number;
    sellerAddress: string;
    amount: number;
    pricePerTonne: string;
    active: boolean;
    listTxHash: string;
    createdAt: Date;
  },
  project: { projectId: number; name: string; ecosystem: string; boundary: string } | null
): ListingDetail {
  return {
    ...listing,
    project: project
      ? {
          projectId: project.projectId,
          name: project.name,
          ecosystem: project.ecosystem,
          boundary: parseJsonField<LatLng[]>(project.boundary, []),
        }
      : null,
  };
}

const listSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  vintage: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().int().positive(),
  // Human-readable NKR, e.g. "450" or "450.5" — parsed with ethers.parseUnits below rather than
  // taken as a plain number, since the on-chain smallest-unit value (18 decimals) can exceed
  // Number.MAX_SAFE_INTEGER for an ordinary price.
  pricePerTonneNKR: z.string().min(1),
});

const purchaseSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive(),
});

/**
 * Lists a batch of credits for sale. NGO-only, and further restricted to the project's own
 * implementer — requireRole only proves "this caller is *an* NGO," not "this caller runs this
 * particular project," so that check happens here against the cached implementer address.
 *
 * The seller needs to have approved Marketplace for ERC-1155 escrow
 * (`creditToken.setApprovalForAll(marketplace, true)`) before listCredits will succeed. Since
 * this backend already holds the implementer's key for the demo (see blockchain/wallets.ts), it
 * grants that approval itself the first time rather than making the caller manage a second
 * blockchain concept — same reasoning as why submitForVerification's caller never has to think
 * about gas or nonces either.
 */
marketplaceRouter.post(
  "/listings",
  requireRole(["NGO"]),
  validateBody(listSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof listSchema>;

    const project = await prisma.onChainProject.findUnique({ where: { projectId: body.projectId } });
    if (!project) {
      res.status(404).json({ error: `No project with id ${body.projectId}` });
      return;
    }
    if (req.user!.walletAddress.toLowerCase() !== project.implementerAddress.toLowerCase()) {
      res.status(403).json({ error: `Only ${project.implementerAddress} may list credits from this project.` });
      return;
    }

    const implementerWallet = findImplementerWallet(project.implementerAddress);
    if (!implementerWallet) {
      res.status(400).json({
        error: `This backend does not hold a key for implementer ${project.implementerAddress}. List this batch from that wallet directly.`,
      });
      return;
    }

    const tokenId: bigint = await carbonCreditToken.encodeTokenId(body.projectId, body.vintage);
    let pricePerTonne: bigint;
    try {
      pricePerTonne = ethers.parseUnits(body.pricePerTonneNKR, 18);
    } catch {
      res.status(400).json({ error: `pricePerTonneNKR "${body.pricePerTonneNKR}" is not a valid decimal amount.` });
      return;
    }

    const alreadyApproved: boolean = await carbonCreditToken.isApprovedForAll(
      implementerWallet.address,
      config.contracts.Marketplace
    );

    const implementerNonceManager = nonceManagerFor(implementerWallet);

    if (!alreadyApproved) {
      const approveTx = await sendWithNonceRetry(implementerNonceManager, () =>
        (carbonCreditToken.connect(implementerNonceManager) as ethers.Contract).setApprovalForAll(
          config.contracts.Marketplace,
          true
        )
      );
      await approveTx.wait();
      logStage("MARKETPLACE", "Approved marketplace for ERC-1155 escrow", { implementer: implementerWallet.address });
    }

    logStage("MARKETPLACE", `Implementer ${implementerWallet.address} listing credits`, {
      projectId: body.projectId,
      vintage: body.vintage,
      tokenId: tokenId.toString(),
      amount: body.amount,
      pricePerTonneNKR: body.pricePerTonneNKR,
    });

    const marketplaceAsSeller = marketplace.connect(implementerNonceManager) as ethers.Contract;
    const listingId: bigint = await marketplaceAsSeller.listCredits.staticCall(tokenId, body.amount, pricePerTonne);
    const tx = await sendWithNonceRetry(implementerNonceManager, () =>
      marketplaceAsSeller.listCredits(tokenId, body.amount, pricePerTonne)
    );
    const receipt = await tx.wait();

    logStage("MARKETPLACE", "Listed on chain", { listingId: listingId.toString(), txHash: receipt.hash });

    // Write-through cache, same pattern as every other route here: event-sync (services/eventSync.ts)
    // reconciles this row from the chain's own CreditsListed/CreditsPurchased events on its next pass.
    await prisma.marketplaceListing.create({
      data: {
        listingId: Number(listingId),
        tokenId: tokenId.toString(),
        projectId: body.projectId,
        vintage: body.vintage,
        sellerAddress: implementerWallet.address,
        amount: body.amount,
        pricePerTonne: pricePerTonne.toString(),
        active: true,
        listTxHash: receipt.hash,
      },
    });

    res.status(201).json({
      listingId: Number(listingId),
      tokenId: tokenId.toString(),
      projectId: body.projectId,
      vintage: body.vintage,
      sellerAddress: implementerWallet.address,
      amount: body.amount,
      pricePerTonne: pricePerTonne.toString(),
      txHash: receipt.hash,
    });
  })
);

/**
 * Browsable listings: active and still holding stock. A listing that's fully sold stays
 * `active` on chain (see Marketplace.sol) since "sold out" and "withdrawn by the seller" are
 * different histories worth keeping distinguishable — but nothing is left to buy from one, so
 * this view filters both conditions rather than just the on-chain flag.
 */
marketplaceRouter.get(
  "/listings",
  asyncHandler(async (_req, res) => {
    const listings = await prisma.marketplaceListing.findMany({
      where: { active: true, amount: { gt: 0 } },
      orderBy: { listingId: "asc" },
    });

    const projects = await prisma.onChainProject.findMany({
      where: { projectId: { in: [...new Set(listings.map((listing) => listing.projectId))] } },
    });
    const projectsById = new Map(projects.map((project) => [project.projectId, project]));

    res.json({
      listings: listings.map((listing) => serializeListing(listing, projectsById.get(listing.projectId) ?? null)),
    });
  })
);

/**
 * One listing's full detail regardless of state — the buy-flow page's data source. Deliberately
 * not restricted to active-with-stock like /listings is, for the same reason GET
 * /api/mrv/:submissionId isn't restricted to Pending: a buyer mid-flow on a listing that just
 * sold out or was cancelled by the seller should see that plainly, not a generic 404.
 */
marketplaceRouter.get(
  "/listings/:listingId",
  asyncHandler(async (req, res) => {
    const listingId = Number(req.params.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      res.status(400).json({ error: "listingId must be a positive integer" });
      return;
    }

    const listing = await prisma.marketplaceListing.findUnique({ where: { listingId } });
    if (!listing) {
      res.status(404).json({ error: `No listing with id ${listingId}` });
      return;
    }

    const project = await prisma.onChainProject.findUnique({ where: { projectId: listing.projectId } });
    res.json(serializeListing(listing, project));
  })
);

/**
 * Buys some or all of a listing. BUYER-only, signed by the authenticated buyer's server-held
 * wallet (see blockchain/wallets.ts). Reads the listing straight from the chain rather than the
 * cache — this is a money-moving call, so it uses the same authoritative source buyCredits
 * itself will check, not a snapshot that might be a block or two stale.
 *
 * Before sending the transaction, this checks the buyer's stablecoin balance and Marketplace
 * allowance itself and fails with a specific, actionable message if either is short — buyCredits
 * would revert on the same conditions (ERC20InsufficientBalance / ERC20InsufficientAllowance),
 * but a raw revert reason doesn't say how much is missing or what to do about it. This
 * deliberately does NOT auto-approve on the buyer's behalf even though this backend holds their
 * key for the demo: unlike listCredits' ERC-1155 escrow approval (a mechanical prerequisite the
 * seller has no reason to reason about), an ERC-20 spending allowance is the buyer's actual
 * consent to a specific spend, worth surfacing rather than silently granting.
 */
marketplaceRouter.post(
  "/purchase",
  requireRole(["BUYER"]),
  validateBody(purchaseSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof purchaseSchema>;

    const buyerWallet = findBuyerWallet(req.user!.walletAddress);
    if (!buyerWallet) {
      res.status(400).json({
        error: `This backend does not hold a key for buyer ${req.user!.walletAddress}. Sign this purchase from that wallet directly.`,
      });
      return;
    }

    let listing;
    try {
      listing = await marketplace.getListing(body.listingId);
    } catch {
      res.status(404).json({ error: `No listing with id ${body.listingId}` });
      return;
    }
    if (!listing.active) {
      res.status(400).json({ error: `Listing ${body.listingId} is no longer active (sold out or withdrawn).` });
      return;
    }
    if (BigInt(body.amount) > (listing.amount as bigint)) {
      res.status(400).json({
        error: `Listing ${body.listingId} only has ${listing.amount} tonnes remaining (requested ${body.amount}).`,
      });
      return;
    }

    const totalPrice = (listing.pricePerTonne as bigint) * BigInt(body.amount);

    const [balance, allowance]: [bigint, bigint] = await Promise.all([
      simStablecoin.balanceOf(buyerWallet.address),
      simStablecoin.allowance(buyerWallet.address, config.contracts.Marketplace),
    ]);
    if (balance < totalPrice) {
      res.status(400).json({
        error: `Insufficient NKR balance: this wallet holds ${ethers.formatUnits(balance, 18)} NKR but the purchase costs ${ethers.formatUnits(totalPrice, 18)} NKR. Claim from the faucet first — POST /api/marketplace/faucet.`,
      });
      return;
    }
    if (allowance < totalPrice) {
      res.status(400).json({
        error: `Insufficient allowance: Marketplace is approved to spend ${ethers.formatUnits(allowance, 18)} NKR from this wallet but the purchase costs ${ethers.formatUnits(totalPrice, 18)} NKR. Approve Marketplace (${config.contracts.Marketplace}) to spend at least that much NKR before purchasing.`,
      });
      return;
    }

    logStage("MARKETPLACE", `Buyer ${buyerWallet.address} purchasing credits`, {
      listingId: body.listingId,
      amount: body.amount,
      totalPriceNKR: ethers.formatUnits(totalPrice, 18),
    });

    const buyerNonceManager = nonceManagerFor(buyerWallet);
    const marketplaceAsBuyer = marketplace.connect(buyerNonceManager) as ethers.Contract;
    // The buyer's own wallet just sent a real approve transaction for this same address
    // (see the allowance check above) — this backend's NonceManager never saw it, so its first
    // nonce lookup for this wallet can still land stale. sendWithNonceRetry is the backstop.
    const tx = await sendWithNonceRetry(buyerNonceManager, () =>
      marketplaceAsBuyer.buyCredits(body.listingId, body.amount)
    );
    const receipt = await tx.wait();

    // Read the exact split back off the event Marketplace itself emitted, rather than
    // recomputing it from the current split bps — those can change (setSplitBps) and this
    // purchase settled at whatever was in effect at transaction time, not now.
    const purchasedLog = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return { log, parsed: marketplace.interface.parseLog(log) };
        } catch {
          return null;
        }
      })
      .find((entry: { log: ethers.Log; parsed: ethers.LogDescription | null } | null) => entry?.parsed?.name === "CreditsPurchased");

    if (!purchasedLog?.parsed) {
      // The transaction succeeded on chain but its own event wasn't found in the receipt —
      // something is wrong enough with our ABI/wiring that trusting a self-computed split would
      // be worse than surfacing this loudly.
      throw new Error(`buyCredits transaction ${receipt.hash} succeeded but emitted no CreditsPurchased event.`);
    }
    const { args } = purchasedLog.parsed;

    logStage("MARKETPLACE", "Purchased on chain", { txHash: receipt.hash });

    const [projectId, vintage]: [bigint, bigint] = await carbonCreditToken.decodeTokenId(args.tokenId);

    // Write-through cache; event-sync (services/eventSync.ts) reconciles this same row, and the
    // listing's remaining amount, from the chain's own CreditsPurchased event on its next pass.
    await prisma.marketplacePurchase.create({
      data: {
        listingId: body.listingId,
        tokenId: (args.tokenId as bigint).toString(),
        projectId: Number(projectId),
        vintage: Number(vintage),
        buyerAddress: buyerWallet.address,
        sellerAddress: args.seller,
        amount: Number(args.amount),
        totalPrice: (args.totalPrice as bigint).toString(),
        ngoAmount: (args.ngoAmount as bigint).toString(),
        platformAmount: (args.platformAmount as bigint).toString(),
        communityAmount: (args.communityAmount as bigint).toString(),
        txHash: receipt.hash,
        logIndex: purchasedLog.log.index,
        purchasedAt: new Date(),
      },
    });
    await prisma.marketplaceListing.updateMany({
      where: { listingId: body.listingId },
      data: { amount: Number(listing.amount) - body.amount },
    });

    res.status(201).json({
      listingId: body.listingId,
      tokenId: (args.tokenId as bigint).toString(),
      buyerAddress: buyerWallet.address,
      sellerAddress: args.seller as string,
      amount: Number(args.amount),
      totalPrice: (args.totalPrice as bigint).toString(),
      ngoAmount: (args.ngoAmount as bigint).toString(),
      platformAmount: (args.platformAmount as bigint).toString(),
      communityAmount: (args.communityAmount as bigint).toString(),
      txHash: receipt.hash,
    });
  })
);

/**
 * Claims SimStablecoin's faucet for the authenticated buyer's server-held wallet. BUYER-only:
 * the faucet exists to fund purchases, so gating it the same way as purchase itself keeps "who
 * can get demo currency" and "who can spend it" the same population, rather than letting any
 * signed-in wallet mint NKR regardless of role.
 *
 * Pre-checks the cooldown itself rather than letting claimFaucet revert, for the same reason
 * purchase pre-checks allowance: FaucetCooldownActive's raw revert doesn't say how long until
 * the next claim is actually allowed.
 */
marketplaceRouter.post(
  "/faucet",
  requireRole(["BUYER"]),
  asyncHandler(async (req, res) => {
    const buyerWallet = findBuyerWallet(req.user!.walletAddress);
    if (!buyerWallet) {
      res.status(400).json({
        error: `This backend does not hold a key for buyer ${req.user!.walletAddress}. Claim the faucet from that wallet directly.`,
      });
      return;
    }

    const [lastClaim, faucetAmount, faucetCooldown]: [bigint, bigint, bigint] = await Promise.all([
      simStablecoin.lastFaucetClaim(buyerWallet.address),
      simStablecoin.FAUCET_AMOUNT(),
      simStablecoin.FAUCET_COOLDOWN(),
    ]);
    if (lastClaim > 0n) {
      const availableAt = lastClaim + faucetCooldown;
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      if (nowSeconds < availableAt) {
        res.status(400).json({
          error: `Faucet already claimed for this wallet — try again after ${new Date(Number(availableAt) * 1000).toISOString()}.`,
          availableAt: new Date(Number(availableAt) * 1000).toISOString(),
        });
        return;
      }
    }

    logStage("MARKETPLACE", `Buyer ${buyerWallet.address} claiming faucet`);

    const buyerNonceManager = nonceManagerFor(buyerWallet);
    const stablecoinAsBuyer = simStablecoin.connect(buyerNonceManager) as ethers.Contract;
    const tx = await sendWithNonceRetry(buyerNonceManager, () => stablecoinAsBuyer.claimFaucet());
    const receipt = await tx.wait();

    logStage("MARKETPLACE", "Faucet claimed on chain", { txHash: receipt.hash, amount: faucetAmount.toString() });

    res.status(201).json({
      buyerAddress: buyerWallet.address,
      amount: faucetAmount.toString(),
      txHash: receipt.hash,
    });
  })
);

/** Purchase history for one buyer, merged with project details, most recent first. */
marketplaceRouter.get(
  "/purchases/:buyerAddress",
  asyncHandler(async (req, res) => {
    let buyerAddress: string;
    try {
      buyerAddress = ethers.getAddress(req.params.buyerAddress);
    } catch {
      res.status(400).json({ error: "buyerAddress must be a valid Ethereum address" });
      return;
    }

    const purchases = await prisma.marketplacePurchase.findMany({
      where: { buyerAddress },
      orderBy: { purchasedAt: "desc" },
    });

    const projects = await prisma.onChainProject.findMany({
      where: { projectId: { in: [...new Set(purchases.map((purchase) => purchase.projectId))] } },
    });
    const projectsById = new Map(projects.map((project) => [project.projectId, project]));

    res.json({
      purchases: purchases.map((purchase) => {
        const project = projectsById.get(purchase.projectId);
        return {
          listingId: purchase.listingId,
          tokenId: purchase.tokenId,
          projectId: purchase.projectId,
          vintage: purchase.vintage,
          sellerAddress: purchase.sellerAddress,
          amount: purchase.amount,
          totalPrice: purchase.totalPrice,
          ngoAmount: purchase.ngoAmount,
          platformAmount: purchase.platformAmount,
          communityAmount: purchase.communityAmount,
          txHash: purchase.txHash,
          purchasedAt: purchase.purchasedAt,
          project: project ? { projectId: project.projectId, name: project.name, ecosystem: project.ecosystem } : null,
        };
      }),
    });
  })
);
