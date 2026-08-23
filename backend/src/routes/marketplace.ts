import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import { prisma } from "../db";
import { carbonCreditToken, marketplace } from "../blockchain/contracts";
import { findImplementerWallet } from "../blockchain/wallets";
import { config } from "../config";
import { validateBody } from "../middleware/validate";
import { requireRole } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { logStage } from "../utils/logger";

export const marketplaceRouter = Router();

const listSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  vintage: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().int().positive(),
  // Human-readable NKR, e.g. "450" or "450.5" — parsed with ethers.parseUnits below rather than
  // taken as a plain number, since the on-chain smallest-unit value (18 decimals) can exceed
  // Number.MAX_SAFE_INTEGER for an ordinary price.
  pricePerTonneNKR: z.string().min(1),
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

    // This route can send two sequential transactions from the same wallet (approve, then
    // list) within one request — nothing else in this backend does that. Leaving the nonce to
    // each call's own auto-population is what a single transaction always does safely elsewhere
    // here, but back to back on one wallet it races: the provider's nonce lookup for the second
    // send can return a stale count taken just before the first transaction's receipt actually
    // landed. Pinning both nonces up front from one fetch removes the race entirely.
    let nextNonce = await implementerWallet.getNonce("pending");

    if (!alreadyApproved) {
      const approveTx = await (carbonCreditToken.connect(implementerWallet) as ethers.Contract).setApprovalForAll(
        config.contracts.Marketplace,
        true,
        { nonce: nextNonce }
      );
      nextNonce += 1;
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

    const marketplaceAsSeller = marketplace.connect(implementerWallet) as ethers.Contract;
    const listingId: bigint = await marketplaceAsSeller.listCredits.staticCall(tokenId, body.amount, pricePerTonne);
    const tx = await marketplaceAsSeller.listCredits(tokenId, body.amount, pricePerTonne, { nonce: nextNonce });
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
      listings: listings.map((listing) => {
        const project = projectsById.get(listing.projectId);
        return {
          listingId: listing.listingId,
          tokenId: listing.tokenId,
          projectId: listing.projectId,
          vintage: listing.vintage,
          sellerAddress: listing.sellerAddress,
          amount: listing.amount,
          pricePerTonne: listing.pricePerTonne,
          listTxHash: listing.listTxHash,
          createdAt: listing.createdAt,
          project: project ? { projectId: project.projectId, name: project.name, ecosystem: project.ecosystem } : null,
        };
      }),
    });
  })
);
